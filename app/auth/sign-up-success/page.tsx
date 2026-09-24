import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-shell";

export default function SignUpSuccessPage() {
  return (
    <AuthShell>
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
            <MailCheck className="h-8 w-8 text-brand" />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-metal mb-2">
            Verifique seu email
          </h2>

          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            Enviamos um link de confirmação para o seu email. Clique no link
            para ativar sua conta e fazer login.
          </p>

          <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Não recebeu?</strong> Verifique
              a pasta de spam. O email pode levar alguns minutos para chegar.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="w-full h-11 bg-transparent"
          >
            <Link href="/auth/login">Voltar para login</Link>
          </Button>
        </div>
    </AuthShell>
  );
}
