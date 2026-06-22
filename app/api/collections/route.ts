import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, getTeamDataScope } from "@/lib/team/scope";
import { NextResponse } from "next/server";

// GET /api/collections — lista clientes com filtros e paginacao
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Escopo de dados (dono x membro) + eventual restricao por SRC do atendente
  const scope = await getTeamDataScope(supabase, user.id);

  // Garante que os status/plataformas padrao existam para o usuario
  await supabase.rpc("seed_collection_defaults", { p_user_id: scope.ownerId });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const statusId = searchParams.get("status_id");
  // Multi-selecao: lista de status_ids separados por virgula
  const statusIds = (searchParams.get("status_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const attendantId = searchParams.get("attendant_id");
  const attendant = searchParams.get("attendant")?.trim();
  // Multi-selecao: lista de atendentes (por nome) separados por virgula
  const attendants = (searchParams.get("attendants") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const product = searchParams.get("product");
  // Multi-selecao: lista de produtos (por nome) separados por virgula
  const products = (searchParams.get("products") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("page_size") || "50", 10))
  );

  let query = supabase
    .from("collection_clients")
    .select("*", { count: "exact" })
    .eq("user_id", scope.ownerId);

  // Membro restrito a um atendente: so ve os clientes com o SRC dele.
  if (scope.srcFilter && scope.srcAreas.cobranca) {
    query = query.eq("src", scope.srcFilter);
  }

  if (statusIds.length > 0) query = query.in("status_id", statusIds);
  else if (statusId) query = query.eq("status_id", statusId);
  if (attendantId) query = query.eq("attendant_id", attendantId);
  // Filtro por atendente identificado pelo nome (cobre cadastrados e SRCs).
  // Multi-selecao: aceita varios nomes via OR (attendant_name OU src).
  const attNames = attendants.length > 0 ? attendants : attendant ? [attendant] : [];
  if (attNames.length > 0) {
    const ors = attNames
      .flatMap((n) => [`attendant_name.eq.${n}`, `src.eq.${n}`])
      .join(",");
    query = query.or(ors);
  }
  if (products.length > 0) query = query.in("product_name", products);
  else if (product) query = query.eq("product_name", product);
  if (searchParams.get("has_schedule") === "1") {
    query = query.not("next_collection_date", "is", null);
  }
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,product_name.ilike.%${search}%`
    );
  }

  const fromIdx = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    clients: data,
    total: count || 0,
    page,
    page_size: pageSize,
  });
}

// POST /api/collections — cria cliente manualmente
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });
  }

  const total = Number(body.total_value) || 0;
  const paid = Number(body.paid_value) || 0;

  // Resolve nomes denormalizados de status/plataforma/atendente
  let statusName = body.status_name || null;
  if (body.status_id && !statusName) {
    const { data: st } = await supabase
      .from("collection_statuses")
      .select("name")
      .eq("id", body.status_id)
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .single();
    statusName = st?.name || null;
  }
  let platformName = body.platform_name || null;
  if (body.platform_id && !platformName) {
    const { data: pl } = await supabase
      .from("collection_platforms")
      .select("name")
      .eq("id", body.platform_id)
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .single();
    platformName = pl?.name || null;
  }
  let attendantName = body.attendant_name || null;
  if (body.attendant_id && !attendantName) {
    const { data: at } = await supabase
      .from("attendants")
      .select("name")
      .eq("id", body.attendant_id)
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .single();
    attendantName = at?.name || null;
  }

  const { data, error } = await supabase
    .from("collection_clients")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      name: body.name,
      phone: body.phone || null,
      email: body.email || null,
      document: body.document || null,
      product_name: body.product_name || null,
      product_id: body.product_id || null,
      platform_id: body.platform_id || null,
      platform_name: platformName,
      attendant_id: body.attendant_id || null,
      attendant_name: attendantName,
      src: body.src || null,
      total_value: total,
      paid_value: paid,
      remaining_value: total - paid,
      payment_method: body.payment_method || null,
      payment_link: body.payment_link || null,
      status_id: body.status_id || null,
      status_name: statusName,
      order_date: body.order_date || new Date().toISOString(),
      next_collection_date: body.next_collection_date || null,
      tracking_code: body.tracking_code || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: data });
}
