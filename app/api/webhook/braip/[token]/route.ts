import { NextResponse, type NextRequest } from "next/server";
import {
  processWebhook,
  resolveWebhookFromToken,
} from "@/lib/webhooks/processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Legacy Braip-specific endpoint. Kept for backward compatibility - forces gateway=braip.
// New integrations should use /api/webhook/<token> instead.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveWebhookFromToken(token);
  if (!resolved) {
    return NextResponse.json(
      { success: false, error: "invalid_token" },
      { status: 404 }
    );
  }
  if (!resolved.is_active) {
    return NextResponse.json(
      { success: false, error: "webhook_disabled" },
      { status: 403 }
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      payload = (await req.json()) as Record<string, unknown>;
    } else {
      const fd = await req.formData();
      payload = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }

  const headers: Record<string, string> = {};
  ["user-agent", "content-type"].forEach((h) => {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  });

  const result = await processWebhook(resolved.user_id, payload, {
    forceGateway: "braip",
    headers,
    webhookId: resolved.webhook_id || undefined,
  });
  return NextResponse.json(result, { status: 200 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const resolved = await resolveWebhookFromToken(token);
  if (!resolved) {
    return NextResponse.json(
      { success: false, error: "invalid_token" },
      { status: 404 }
    );
  }
  return NextResponse.json({
    success: true,
    message: "braip_webhook_ready",
    active: resolved.is_active,
  });
}
