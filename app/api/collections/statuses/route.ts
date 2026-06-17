import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.rpc("seed_collection_defaults", { p_user_id: user.id });

  const { data, error } = await supabase
    .from("collection_statuses")
    .select("*")
    .eq("user_id", user.id)
    .order("position");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ statuses: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.name || !body.color) {
    return NextResponse.json({ error: "Nome e cor obrigatorios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collection_statuses")
    .insert({
      user_id: user.id,
      name: body.name,
      color: body.color,
      icon: body.icon || null,
      position: body.position ?? 99,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: data });
}
