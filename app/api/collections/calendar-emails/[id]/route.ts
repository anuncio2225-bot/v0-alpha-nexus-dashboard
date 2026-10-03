import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, scopedSrc } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
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

  const { error } = await supabase
    .from("collection_calendar_emails")
    .delete()
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
