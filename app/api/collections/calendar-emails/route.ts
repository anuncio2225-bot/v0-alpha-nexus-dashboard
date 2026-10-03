import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, scopedSrc } from "@/lib/team/scope";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("collection_calendar_emails")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emails: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Atendente vê o quadro, mas não altera a configuração dele.
  if (await scopedSrc(supabase, user.id, "cobranca")) {
    return NextResponse.json({ error: "Somente o dono altera esta configuração" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.email) {
    return NextResponse.json({ error: "Email obrigatorio" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collection_calendar_emails")
    .insert({ user_id: await getEffectiveUserId(supabase, user.id), email: body.email, name: body.name || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ email: data });
}
