import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/dashboard";

  // Determine the correct base URL (handles preview deployments)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const baseUrl = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  // Auth provider returned an error
  if (errorParam) {
    const params = new URLSearchParams({
      error: errorParam,
      error_description: errorDescription || "",
    });
    return NextResponse.redirect(`${baseUrl}/auth/login?${params.toString()}`);
  }

  const supabase = await createClient();

  // Email confirmation / password recovery flow (token_hash + type)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      const params = new URLSearchParams({
        error: "invalid_link",
        error_description: error.message,
      });
      return NextResponse.redirect(
        `${baseUrl}/auth/login?${params.toString()}`
      );
    }

    return NextResponse.redirect(`${baseUrl}${next}`);
  }

  // PKCE flow (OAuth or magic link with code)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.log("[v0] exchangeCodeForSession error:", error.message);
      // PKCE failure usually means the email was opened in a different browser/device
      // than where signup was initiated. Email is likely already confirmed - tell user to login.
      const isPkceError =
        error.message.toLowerCase().includes("code verifier") ||
        error.message.toLowerCase().includes("pkce");

      const params = new URLSearchParams({
        error: isPkceError ? "email_confirmed" : "auth_failed",
        error_description: isPkceError
          ? "Sua conta foi confirmada. Faca login para continuar."
          : error.message,
      });
      return NextResponse.redirect(
        `${baseUrl}/auth/login?${params.toString()}`
      );
    }

    // Create default settings if not exists
    if (data.user) {
      await supabase.from("settings").upsert(
        {
          user_id: data.user.id,
          meta_tax_multiplier: 1.0,
          timezone: "America/Sao_Paulo",
          currency: "BRL",
        },
        { onConflict: "user_id" }
      );
    }

    return NextResponse.redirect(`${baseUrl}${next}`);
  }

  return NextResponse.redirect(
    `${baseUrl}/auth/login?error=no_code&error_description=Link%20invalido`
  );
}
