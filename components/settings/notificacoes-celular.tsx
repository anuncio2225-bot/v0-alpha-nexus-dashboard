"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BellRing, Smartphone } from "lucide-react";
import { EVENTOS_PUSH, querReceber, type EventoPush, type PreferenciasPush } from "@/lib/push/eventos";

type Situacao =
  | "verificando"
  | "sem-suporte"
  | "precisa-instalar" // iPhone só recebe com o app na tela inicial
  | "desligado"
  | "negado"
  | "ligado";

type Aparelho = "ios" | "android" | "computador";

/** A chave VAPID vem em base64url e a API do navegador quer bytes. */
function paraBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bruto = atob(base64);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

const iguais = (a: ArrayBuffer, b: Uint8Array) => {
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

/**
 * Traduz a falha do navegador em algo que dá para resolver. No Android,
 * "Registration failed - push service error" é o Chrome sem conseguir falar
 * com o serviço do Google (economia de dados, VPN, Play Services velho).
 */
function explicar(e: unknown): { texto: string; servicoDePush: boolean } {
  const nome = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e);
  if (nome === "NotAllowedError")
    return { texto: "O aparelho bloqueou as notificações. Autorize e tente de novo.", servicoDePush: false };
  if (nome === "NotSupportedError")
    return { texto: "Este navegador não recebe notificações. Use o Chrome (Android) ou o Safari (iPhone).", servicoDePush: false };
  if (nome === "AbortError" || /push service|registration failed/i.test(msg))
    return { texto: "O Android não conseguiu se registrar no serviço de notificações do Google.", servicoDePush: true };
  return { texto: msg || "Não deu para ativar agora.", servicoDePush: false };
}

async function assinar(registro: ServiceWorkerRegistration, chave: Uint8Array) {
  // Inscrição de outra chave faz o subscribe estourar, e inscrição invalidada
  // pelo serviço continua aparecendo como viva — então só reaproveita se for
  // da mesma chave; senão apaga e assina de novo.
  const existente = await registro.pushManager.getSubscription();
  if (existente) {
    const k = existente.options?.applicationServerKey;
    if (k && iguais(k, chave)) return existente;
    await existente.unsubscribe();
  }
  try {
    return await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave as BufferSource });
  } catch (e) {
    // Erro passageiro do serviço do Google é comum: uma segunda tentativa resolve boa parte.
    await new Promise((r) => setTimeout(r, 1200));
    const sobrou = await registro.pushManager.getSubscription();
    if (sobrou) await sobrou.unsubscribe();
    try {
      return await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave as BufferSource });
    } catch {
      throw e;
    }
  }
}

const GRUPOS = ["Pagamento", "Entrega", "Problemas"] as const;

export function NotificacoesCelular() {
  const [situacao, setSituacao] = useState<Situacao>("verificando");
  const [aparelho, setAparelho] = useState<Aparelho>("computador");
  const [instalado, setInstalado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [servicoDePush, setServicoDePush] = useState(false);
  const [diagnostico, setDiagnostico] = useState("");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PreferenciasPush>({});
  const [recebidoEm, setRecebidoEm] = useState<string | null>(null);

  const carregarAparelho = useCallback(async (ep: string) => {
    const r = await fetch(`/api/push/preferencias?endpoint=${encodeURIComponent(ep)}`);
    if (!r.ok) return false;
    const d = await r.json();
    if (!d.registrado) return false;
    setPrefs(d.preferencias || {});
    setRecebidoEm(d.ultimo_recebido_em || null);
    return true;
  }, []);

  useEffect(() => {
    (async () => {
      const temSW = "serviceWorker" in navigator;
      const temPush = "PushManager" in window;
      const temNotificacao = "Notification" in window;
      const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const ehAndroid = /Android/.test(navigator.userAgent);
      const naTelaInicial =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true;
      const permissao = temNotificacao ? Notification.permission : "indisponível";

      setAparelho(ehIOS ? "ios" : ehAndroid ? "android" : "computador");
      setInstalado(naTelaInicial);
      setDiagnostico(
        `sw:${temSW ? "ok" : "não"} · push:${temPush ? "ok" : "não"} · instalado:${naTelaInicial ? "sim" : "não"} · permissão:${permissao}`
      );

      if (ehIOS && !naTelaInicial) return setSituacao("precisa-instalar");
      if (!temSW || !temPush || !temNotificacao) return setSituacao("sem-suporte");
      if (Notification.permission === "denied") return setSituacao("negado");

      // Este aparelho já está registrado?
      try {
        const registro = await navigator.serviceWorker.getRegistration("/");
        const inscricao = await registro?.pushManager.getSubscription();
        if (inscricao && Notification.permission === "granted") {
          setEndpoint(inscricao.endpoint);
          if (await carregarAparelho(inscricao.endpoint)) return setSituacao("ligado");
        }
      } catch {
        // segue como desligado
      }
      setSituacao("desligado");
    })();
  }, [carregarAparelho]);

  async function ligar() {
    setOcupado(true);
    setRecado(null);
    setServicoDePush(false);
    try {
      // A permissão só pode ser pedida a partir de um toque.
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setSituacao(permissao === "denied" ? "negado" : "desligado");
        setRecado("Você não autorizou. Toque de novo e escolha Permitir.");
        return;
      }
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) throw new Error("O servidor está sem a chave de notificações.");

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const inscricao = await assinar(registro, paraBytes(chave));

      const r = await fetch("/api/push/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inscricao: inscricao.toJSON() }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "não deu para registrar o aparelho");

      setEndpoint(inscricao.endpoint);
      await carregarAparelho(inscricao.endpoint);
      setSituacao("ligado");
      setRecado("Aparelho registrado. Mande um teste para confirmar.");
    } catch (e) {
      const { texto, servicoDePush: doGoogle } = explicar(e);
      setRecado(texto);
      setServicoDePush(doGoogle);
      setDiagnostico((d) => `${d} · erro:${e instanceof Error ? e.name : "falha"}`);
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    if (!endpoint) return;
    setOcupado(true);
    try {
      await fetch("/api/push/inscrever", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      const registro = await navigator.serviceWorker.getRegistration("/");
      const inscricao = await registro?.pushManager.getSubscription();
      await inscricao?.unsubscribe();
      setEndpoint(null);
      setSituacao("desligado");
      setRecado("Este aparelho não recebe mais notificações.");
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await fetch("/api/push/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      const d = await r.json();
      setRecado(
        d.enviados > 0
          ? "Teste enviado. Deve chegar em segundos."
          : `Nada enviado (${d.ignorado ?? "aparelho não registrado"}).`
      );
    } catch {
      setRecado("Falha ao enviar o teste.");
    } finally {
      setOcupado(false);
    }
  }

  async function alternar(ev: EventoPush, valor: boolean) {
    if (!endpoint) return;
    const antes = prefs;
    setPrefs({ ...prefs, [ev]: valor });
    const r = await fetch("/api/push/preferencias", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, preferencias: { [ev]: valor } }),
    });
    if (!r.ok) {
      setPrefs(antes);
      toast.error("Não deu para salvar. Tente de novo.");
    }
  }

  const rodape = diagnostico && (
    <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground/70">{diagnostico}</p>
  );

  let conteudo: React.ReactNode;
  if (situacao === "verificando") {
    conteudo = <p className="text-sm text-muted-foreground">Verificando este aparelho…</p>;
  } else if (situacao === "precisa-instalar") {
    conteudo = (
      <div>
        <p className="text-sm">No iPhone, a notificação só funciona com o AlphaNexus na tela inicial.</p>
        <PassosIPhone />
        {rodape}
      </div>
    );
  } else if (situacao === "sem-suporte") {
    conteudo = (
      <div>
        <p className="text-sm text-muted-foreground">
          Este aparelho não recebe notificações. No iPhone é preciso iOS 16.4 ou mais novo, com o app
          aberto pela tela inicial. No Android, use o Chrome.
        </p>
        {rodape}
      </div>
    );
  } else if (situacao === "negado") {
    conteudo = (
      <div>
        <p className="text-sm">As notificações estão bloqueadas para o AlphaNexus neste aparelho.</p>
        <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {aparelho === "ios" ? (
            <li>
              1. Ajustes → Notificações → <strong className="text-foreground">AlphaNexus</strong> → ligar{" "}
              <strong className="text-foreground">Permitir Notificações</strong>.
            </li>
          ) : (
            <>
              <li>
                1. Segure o ícone do <strong className="text-foreground">AlphaNexus</strong> na tela inicial →{" "}
                <strong className="text-foreground">Informações do app</strong>.
              </li>
              <li>
                2. Toque em <strong className="text-foreground">Notificações</strong> e ligue.
              </li>
            </>
          )}
          <li>{aparelho === "ios" ? "2." : "3."} Volte aqui e toque em ativar de novo.</li>
        </ol>
        {rodape}
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {situacao === "ligado" ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-sm text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Este aparelho está recebendo
              </span>
              <Button variant="outline" size="sm" onClick={testar} disabled={ocupado}>
                {ocupado ? "Enviando…" : "Mandar teste"}
              </Button>
              <Button variant="ghost" size="sm" onClick={desligar} disabled={ocupado} className="text-muted-foreground">
                Desativar neste aparelho
              </Button>
            </>
          ) : (
            <Button onClick={ligar} disabled={ocupado} className="bg-brand hover:bg-brand/90">
              {ocupado ? "Ativando…" : "Ativar notificações neste aparelho"}
            </Button>
          )}
        </div>

        {recado && <p className="text-sm text-muted-foreground">{recado}</p>}

        {servicoDePush && (
          <div className="rounded-xl border border-warning/35 bg-warning/8 p-4">
            <p className="text-sm text-warning">
              É uma trava do próprio celular, não da sua conta. Faça nesta ordem e toque em ativar de novo:
            </p>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Desligue a <strong className="text-foreground">economia de dados</strong> e qualquer <strong className="text-foreground">VPN</strong>.</li>
              <li>2. Na Play Store, atualize o <strong className="text-foreground">Google Play Services</strong>, se aparecer.</li>
              <li>3. Feche e abra o AlphaNexus pelo ícone da tela inicial.</li>
              <li>4. Se continuar, reinicie o celular.</li>
            </ol>
          </div>
        )}

        {situacao === "ligado" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha o que este aparelho recebe. Cada celular tem a sua escolha.
            </p>
            {GRUPOS.map((g) => (
              <div key={g}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
                <div className="divide-y divide-border rounded-xl border border-border">
                  {EVENTOS_PUSH.filter((e) => e.grupo === g).map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm text-foreground">
                          {e.emoji} {e.titulo}
                        </span>
                        <span className="block text-xs text-muted-foreground">{e.descricao}</span>
                      </span>
                      <Switch checked={querReceber(prefs, e.id)} onCheckedChange={(v) => alternar(e.id, v)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {recebidoEm && (
              <p className="text-xs text-muted-foreground">
                Última notificação confirmada neste aparelho: {new Date(recebidoEm).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}

        {aparelho !== "computador" && !instalado && (
          <div className="rounded-xl border border-border bg-card-elevated p-4">
            <p className="text-sm">
              A notificação chega melhor com o AlphaNexus na tela inicial — e no iPhone só funciona assim.
            </p>
            {aparelho === "ios" ? <PassosIPhone /> : <PassosAndroid />}
          </div>
        )}
        {rodape}
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-brand" />
          <CardTitle className="text-lg">Notificações no celular</CardTitle>
        </div>
        <CardDescription className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" />
          Venda aprovada, Pix e boleto gerados, entrega e cobrança — direto na tela do celular
        </CardDescription>
      </CardHeader>
      <CardContent>{conteudo}</CardContent>
    </Card>
  );
}

function PassosIPhone() {
  return (
    <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
      <li>1. Abra o painel no <strong className="text-foreground">Safari</strong> (pelo Chrome do iPhone não funciona).</li>
      <li>2. Toque em <strong className="text-foreground">Compartilhar</strong> — o quadrado com a seta para cima.</li>
      <li>3. Escolha <strong className="text-foreground">Adicionar à Tela de Início</strong> → <strong className="text-foreground">Adicionar</strong>.</li>
      <li>4. Abra o AlphaNexus pelo ícone novo, entre em Configurações e toque em <strong className="text-foreground">Ativar notificações</strong>.</li>
    </ol>
  );
}

function PassosAndroid() {
  return (
    <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
      <li>1. Abra o painel no <strong className="text-foreground">Chrome</strong>.</li>
      <li>2. Toque nos <strong className="text-foreground">três pontinhos</strong>, no canto de cima.</li>
      <li>3. Escolha <strong className="text-foreground">Instalar aplicativo</strong> (ou Adicionar à tela inicial).</li>
      <li>4. Abra o AlphaNexus pelo ícone novo e ative as notificações aqui.</li>
    </ol>
  );
}
