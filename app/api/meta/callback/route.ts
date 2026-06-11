import { NextResponse } from "next/server";

// ============================================================================
// /api/meta/callback — DESCONTINUADO
//
// O fluxo OAuth (login Facebook) foi substituido pela conexao via
// System User Token em /api/meta/connect. Esta rota permanece apenas para
// nao quebrar redirects antigos; ela apenas redireciona de volta para a
// pagina de conexao com um aviso.
// ============================================================================

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(
    `${origin}/dashboard/connect?notice=oauth_descontinuado`
  );
}
