import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MailCheck } from "lucide-react";

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-sans tracking-tight">
            <span className="text-brand">Alpha</span>
            <span className="text-foreground">Nexus</span>
          </h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-xl text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
            <MailCheck className="h-8 w-8 text-brand" />
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-2">
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
      </div>
    </div>
  );
}
