import { NextResponse, type NextRequest } from "next/server";
import {
  processWebhook,
  resolveWebhookFromToken,
} from "@/lib/webhooks/processor";
import type { WebhookGateway } from "@/lib/webhooks/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Unified webhook endpoint - auto-detects gateway from payload.
 * URL: /api/webhook/<webhook_token>
 *
 * IMPORTANT: This endpoint NEVER returns an error status (4xx/5xx).
 * Always returns 200 to prevent Braip/Kiwify from blocking the webhook.
 */
async function handle(req: NextRequest, token: string) {
  console.log("[v0] Webhook hit:", token);

  try {
    // 1. Resolve token to user
    const resolved = await resolveWebhookFromToken(token);

    if (!resolved) {
      console.log("[v0] Invalid token:", token);
      // Still return 200 to not block retries, but indicate error
      return NextResponse.json({
        success: false,
        error: "invalid_token",
        message: "Token not found",
      });
    }

    if (!resolved.is_active) {
      console.log("[v0] Webhook disabled:", token);
      return NextResponse.json({
        success: false,
        error: "webhook_disabled",
        message: "Webhook is disabled",
      });
    }

    // 2. Parse payload - be VERY tolerant
    let payload: Record<string, unknown> = {};

    try {
      const contentType = req.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const text = await req.text();
        payload = text ? JSON.parse(text) : {};
      } else if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const fd = await req.formData();
        payload = Object.fromEntries(fd.entries()) as Record<string, unknown>;

        // Try to parse any JSON strings in form data
        for (const [key, value] of Object.entries(payload)) {
          if (typeof value === "string" && value.startsWith("{")) {
            try {
              payload[key] = JSON.parse(value);
            } catch {
              // Keep as string
            }
          }
        }
      } else {
        // Try to parse as JSON anyway
        const text = await req.text();
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = { raw_body: text };
          }
        }
      }
    } catch (parseErr) {
      console.error("[v0] Payload parse error:", parseErr);
      payload = { parse_error: true, error_message: String(parseErr) };
    }

    // 3. Collect useful headers
    const headers: Record<string, string> = {};
    [
      "user-agent",
      "x-webhook-source",
      "x-forwarded-for",
      "content-type",
      "x-real-ip",
    ].forEach((h) => {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    });

    // 4. Determine gateway
    const url = new URL(req.url);
    const queryGateway = url.searchParams.get("gateway") as WebhookGateway | null;
    const sourceGateway =
      resolved.source && resolved.source !== "universal"
        ? (resolved.source as WebhookGateway)
        : null;
    const forcedGateway = queryGateway || sourceGateway;

    // 5. Process (never throws)
    const result = await processWebhook(resolved.user_id, payload, {
      forceGateway: forcedGateway || undefined,
      headers,
      webhookId: resolved.webhook_id || undefined,
    });

    console.log("[v0] Webhook result:", result);

    // Always return 200
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // Global catch - NEVER fail
    console.error("[v0] Webhook global error:", err);

    return NextResponse.json(
      {
        success: false,
        error: "internal_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 200 } // Still 200!
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  return handle(req, token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const resolved = await resolveWebhookFromToken(token);

    if (!resolved) {
      return NextResponse.json({ success: true, message: "invalid_token" });
    }

    return NextResponse.json({
      success: true,
      message: "webhook_ready",
      active: resolved.is_active,
    });
  } catch {
    return NextResponse.json({ success: true, message: "error" });
  }
}
