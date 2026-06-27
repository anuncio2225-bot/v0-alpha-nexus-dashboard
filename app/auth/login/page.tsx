"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const message = searchParams.get("message");

    if (message === "email_confirmed") {
      setInfo("Email confirmado com sucesso. Faça login para continuar.");
    } else if (message === "password_reset") {
      setInfo("Senha atualizada com sucesso. Faça login com a nova senha.");
    }

    if (errorParam === "email_confirmed") {
      // Not really an error - PKCE failed but email is confirmed. Show as info.
      setInfo(
        errorDescription || "Conta confirmada. Faça login para continuar."
      );
    } else if (errorParam === "auth_failed") {
      setError(errorDescription || "Falha na autenticação.");
    } else if (errorParam === "invalid_link") {
      setError("Link inválido ou expirado. Solicite um novo.");
    } else if (errorParam) {
      setError(errorDescription || `Erro: ${errorParam}`);
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setError(
            "Email não confirmado. Verifique sua caixa de entrada e clique no link de confirmação."
          );
        } else if (error.message.toLowerCase().includes("invalid login")) {
          setError("Email ou senha incorretos.");
        } else {
          setError(error.message);
        }
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-sans tracking-tight">
            <span className="text-brand">Alpha</span>
            <span className="text-foreground">Nexus</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Gestão inteligente de operações
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Entrar na sua conta
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Use seu email e senha
            </p>
          </div>

          {info && (
            <div className="mb-4 p-3 bg-brand/10 border border-brand/20 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand flex-shrink-0 mt-0.5" />
              <p className="text-brand text-sm">{info}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-brand hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-brand hover:bg-brand/90 text-brand-foreground font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Não tem conta?{" "}
            <Link
              href="/auth/signup"
              className="text-brand hover:underline font-medium"
            >
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
