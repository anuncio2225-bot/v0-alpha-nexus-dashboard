import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.product_name === "string" || body.product_name === null) {
    updates.product_name = body.product_name?.trim() || null;
  }
  if (typeof body.source === "string") {
    const valid = ["universal", "braip", "kiwify", "hotmart", "monetizze", "payt", "pag2pay", "pag2ppay"];
    if (!valid.includes(body.source)) {
      return NextResponse.json({ error: "invalid_source" }, { status: 400 });
    }
    updates.source = body.source;
  }
  if (typeof body.operational_type === "string") {
    const validModes = ["afterpay", "antecipado", "recuperacao"];
    if (validModes.includes(body.operational_type)) {
      updates.operational_type = body.operational_type;
    }
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (body.regenerate_token === true) {
    updates.token = randomBytes(16).toString("hex");
  }

  const { data, error } = await supabase
    .from("webhooks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, product_name, source, token, is_active, operational_type, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ webhook: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("webhooks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
