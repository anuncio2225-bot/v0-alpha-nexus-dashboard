"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface InviteInfo {
  owner_name: string;
  invited_email: string;
  invited_name: string | null;
  status: string;
}

function TeamInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) {
        setError("Convite inválido: token ausente.");
        setLoading(false);
        return;
      }
      // Verifica se o usuario esta logado
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthed(!!user);

      try {
        const res = await fetch(
          `/api/team/accept?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Convite inválido ou expirado.");
        } else {
          setInvite(data);
        }
      } catch {
        setError("Erro ao carregar o convite.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível aceitar o convite.");
        setAccepting(false);
        return;
      }
      setAccepted(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setError("Erro ao aceitar o convite.");
      setAccepting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/15">
            <ShieldCheck className="h-7 w-7 text-brand" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Convite para equipe
          </h1>

          {loading && (
            <div className="mt-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando convite...</span>
            </div>
          )}

          {!loading && error && (
            <div className="mt-6 w-full">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
              <Button asChild variant="outline" className="mt-6 w-full">
                <Link href="/dashboard">Ir para o início</Link>
              </Button>
            </div>
          )}

          {!loading && invite && !error && (
            <div className="mt-4 w-full">
              {accepted ? (
                <div className="flex flex-col items-center gap-2 text-[var(--chart-2)]">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="text-sm text-foreground">
                    Convite aceito! Redirecionando...
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {invite.owner_name}
                    </span>{" "}
                    convidou você para acessar a conta como membro da equipe.
                  </p>
                  <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-left">
                    <p className="text-xs text-muted-foreground">
                      Convite para
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {invite.invited_email}
                    </p>
                  </div>

                  {authed ? (
                    <Button
                      onClick={handleAccept}
                      disabled={accepting}
                      className="mt-6 w-full bg-brand text-brand-foreground hover:bg-brand/90"
                    >
                      {accepting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Aceitando...
                        </>
                      ) : (
                        "Aceitar convite"
                      )}
                    </Button>
                  ) : (
                    <div className="mt-6 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Faça login ou crie uma conta com o e-mail{" "}
                        <span className="font-medium text-foreground">
                          {invite.invited_email}
                        </span>{" "}
                        para aceitar.
                      </p>
                      <Button
                        asChild
                        className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
                      >
                        <Link
                          href={`/auth/login?invite=${encodeURIComponent(token)}`}
                        >
                          Fazer login
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="w-full">
                        <Link
                          href={`/auth/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.invited_email)}`}
                        >
                          Criar conta
                        </Link>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function TeamInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TeamInviteContent />
    </Suspense>
  );
}
