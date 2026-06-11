import { NextResponse } from "next/server";

// Public config for Meta OAuth - no auth required
export async function GET() {
  return NextResponse.json({
    app_id: process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/meta/callback`,
  });
}
