import type { ReactNode } from "react";
import { Activity, BadgeDollarSign, Users } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Sparkline } from "@/components/dashboard/sparkline";

// Curva ilustrativa do cartão decorativo (sem números: é só a forma do gráfico).
const SHOWCASE_CURVE = [4, 6, 5, 9, 7, 12, 10, 15, 13, 19, 17, 24];

const FEATURES = [
  { icon: Activity, title: "Vendas ao vivo", text: "Payt e Braip chegando no painel na hora" },
  { icon: BadgeDollarSign, title: "Lucro de verdade", text: "Meta Ads, taxas e imposto descontados" },
  { icon: Users, title: "Equipe e cobrança", text: "Atendentes, comissões e cobrança num lugar só" },
];

/**
 * Moldura das telas de acesso (login, criar conta, recuperar senha): fundo com
 * grade geométrica e brilho da marca; no computador, vitrine à esquerda e o
 * formulário em vidro à direita.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Fundo: grade + brilhos */}
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/20 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-48 right-[-10%] h-[480px] w-[480px] rounded-full bg-slate-400/10 blur-[140px]" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Vitrine (só no computador) */}
        <section className="hidden lg:block">
          <Logo className="text-3xl" />
          <h2 className="mt-10 text-[52px] font-semibold leading-[1.02] tracking-tight text-metal">
            Sua operação
            <br />
            inteira, ao vivo.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Vendas, cobrança, equipe e lucro real no mesmo painel — atualizado sozinho a cada venda.
          </p>

          <div className="mt-10 grid max-w-lg gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="surface flex items-center gap-4 rounded-2xl border border-[var(--border-glass)] bg-card/60 px-4 py-3.5 backdrop-blur">
                <span className="icon-tile h-10 w-10 shrink-0">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Cartão decorativo com o gráfico luminoso */}
          <div className="surface ambient relative mt-6 h-[120px] max-w-lg overflow-hidden rounded-2xl border border-[var(--border-glass)] bg-card/70">
            <div className="relative z-10 flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <span className="live-dot" />
              Faturamento do período
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[76px]">
              <Sparkline data={SHOWCASE_CURVE} color="#10b981" />
            </div>
          </div>
        </section>

        {/* Formulário */}
        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo className="text-3xl" />
          </div>
          <div className="surface shine-top rounded-3xl border border-[var(--border-glass)] bg-card/80 p-7 backdrop-blur-xl sm:p-9">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
