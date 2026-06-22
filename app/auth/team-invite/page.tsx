"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// O fluxo de equipe agora cria a conta do membro JA ATIVA, com senha definida
// pelo dono. Nao ha mais "aceite de convite": o membro entra direto no login.
// Esta pagina apenas redireciona links antigos para o login.
export default function TeamInviteRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace("/auth/login"), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-brand" />
        <h1 className="text-lg font-semibold text-foreground">
          Acesso de equipe
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Agora o acesso é feito direto pelo login, com o e-mail e a senha que o
          administrador definiu para você. Redirecionando para o login...
        </p>
      </Card>
    </div>
  );
}
