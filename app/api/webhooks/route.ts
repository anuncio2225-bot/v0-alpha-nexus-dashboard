import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { randomBytes } from "crypto";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("webhooks")
    .select("id, name, product_name, source, token, is_active, operational_type, created_at, updated_at")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webhooks: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name: string = (body?.name || "").trim();
  const product_name: string | null = body?.product_name?.trim() || null;
  const source: string = body?.source || "universal";
  const operational_type: string = body?.operational_type || "afterpay";

  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const validSources = ["universal", "braip", "kiwify", "hotmart", "monetizze", "payt", "pag2pay", "pag2ppay"];
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }

  const validModes = ["afterpay", "antecipado", "recuperacao"];
  const safeOperationalType = validModes.includes(operational_type)
    ? operational_type
    : "afterpay";

  const token = randomBytes(16).toString("hex");

  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      name,
      product_name,
      source,
      token,
      is_active: true,
      operational_type: safeOperationalType,
    })
    .select("id, name, product_name, source, token, is_active, operational_type, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ webhook: data });
}
