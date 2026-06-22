import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

const DEFAULT_TEMPLATE = `Ola {nome}!

Passando para lembrar sobre o pagamento pendente do seu pedido:

Produto: {produto}
Valor pendente: R$ {valor_pendente}
Combinado para: {data}

{link_pagamento}

Qualquer duvida estamos a disposicao!`;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("collection_settings")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .maybeSingle();

  return NextResponse.json({
    settings: {
      message_template: data?.message_template || DEFAULT_TEMPLATE,
      auto_import: data?.auto_import ?? false,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {
    user_id: await getEffectiveUserId(supabase, user.id),
    updated_at: new Date().toISOString(),
  };
  if ("message_template" in body) updates.message_template = body.message_template;
  if ("auto_import" in body) updates.auto_import = body.auto_import;

  const { data, error } = await supabase
    .from("collection_settings")
    .upsert(updates, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
