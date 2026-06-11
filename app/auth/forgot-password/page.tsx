"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const redirectBase =
        process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
        window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/auth/callback?next=/auth/update-password`,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao enviar email de reset"
      );
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
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Recuperar senha
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Enviaremos um link para redefinir sua senha
            </p>
          </div>

          {success ? (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-8 w-8 text-brand" />
              </div>
              <p className="text-foreground font-medium mb-2">
                Email enviado!
              </p>
              <p className="text-muted-foreground text-sm mb-6">
                Verifique sua caixa de entrada e clique no link para redefinir
                sua senha.
              </p>
              <Button asChild variant="outline" className="w-full bg-transparent">
                <Link href="/auth/login">Voltar para login</Link>
              </Button>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
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

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-brand hover:bg-brand/90 text-brand-foreground font-medium"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar link de recuperação"
                  )}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground text-center mt-6">
                Lembrou a senha?{" "}
                <Link
                  href="/auth/login"
                  className="text-brand hover:underline font-medium"
                >
                  Voltar para login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
