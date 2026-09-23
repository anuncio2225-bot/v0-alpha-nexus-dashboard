import { createClient } from "@/lib/supabase/server";
import { getTeamDataScope } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

// Sanitiza um campo para CSV separado por ";": remove quebras de linha e troca
// o separador por espaço, mantendo o layout simples do modelo de importação.
function csv(v: string | null | undefined): string {
  return (v ?? "").replace(/[\r\n]+/g, " ").replace(/;/g, " ").trim();
}

// GET /api/collections/export — exporta os clientes APLICANDO os mesmos filtros
// da tela. Sem filtro = exporta tudo. Formato do modelo de importacao de
// contatos: Nome;Telefone;Email;CPF;Etiqueta;Endereco
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getTeamDataScope(supabase, user.id);

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const statusIds = (searchParams.get("status_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const attendants = (searchParams.get("attendants") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const products = (searchParams.get("products") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const platforms = (searchParams.get("platforms") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let query = supabase
    .from("collection_clients")
    .select("name, phone, email, document")
    .eq("user_id", scope.ownerId);

  // Membro restrito a um atendente: exporta apenas os clientes do SRC dele.
  if (scope.srcFilter && scope.srcAreas.cobranca) {
    query = query.eq("src", scope.srcFilter);
  }

  if (statusIds.length > 0) query = query.in("status_id", statusIds);
  if (attendants.length > 0) {
    query = query.or(
      attendants
        .flatMap((n) => [`attendant_name.eq.${n}`, `src.eq.${n}`])
        .join(",")
    );
  }
  if (products.length > 0) query = query.in("product_name", products);
  if (platforms.length > 0) query = query.in("platform_name", platforms);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,product_name.ilike.%${search}%,document.ilike.%${search}%,transaction_code.ilike.%${search}%`
    );
  }

  const { data, error } = await fetchAll(query.order("name", { ascending: true }));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = "Nome;Telefone;Email;CPF;Etiqueta;Endereco";
  const lines = (data || []).map((c) =>
    [csv(c.name), csv(c.phone), csv(c.email), csv(c.document), "", ""].join(";")
  );
  // BOM para o Excel abrir com acentuacao correta.
  const body = "\uFEFF" + [header, ...lines].join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-cobranca-${date}.csv"`,
    },
  });
}
