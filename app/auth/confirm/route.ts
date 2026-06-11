import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Dedicated route for email confirmation and password recovery.
 * Uses the token_hash flow (NO PKCE required) - works across any browser/device.
 *
 * Configure in Supabase Dashboard > Authentication > Email Templates:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const baseUrl = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${baseUrl}/auth/login?error=invalid_link&error_description=Link%20de%20confirmacao%20invalido`
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.log("[v0] verifyOtp error:", error.message);
    const params = new URLSearchParams({
      error: "invalid_link",
      error_description: error.message,
    });
    return NextResponse.redirect(`${baseUrl}/auth/login?${params.toString()}`);
  }

  // Create default settings on first signup confirmation
  if (data.user && type === "email") {
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
