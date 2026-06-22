import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "color"]) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("collection_platforms")
    .update(updates)
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ("name" in body) {
    await supabase
      .from("collection_clients")
      .update({ platform_name: body.name })
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .eq("platform_id", id);
  }

  return NextResponse.json({ platform: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: platform } = await supabase
    .from("collection_platforms")
    .select("is_system")
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .single();

  if (platform?.is_system) {
    return NextResponse.json(
      { error: "Esta plataforma nao pode ser removida" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("collection_platforms")
    .delete()
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
