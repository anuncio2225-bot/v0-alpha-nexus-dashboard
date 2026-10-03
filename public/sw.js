/* Service worker do AlphaNexus.
 *
 * Só recebe push e abre o painel no clique. Sem cache de página: número de
 * venda tem que ser fresco.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { titulo: "AlphaNexus", corpo: evento.data ? evento.data.text() : "" };
  }

  const titulo = dados.titulo || "AlphaNexus";
  const opcoes = {
    body: dados.corpo || "",
    icon: "/icone-192.png",
    badge: "/badge-96.png",
    // Mesma tag = o aviso novo da mesma venda substitui o anterior.
    tag: dados.tag || dados.tipo || "alphanexus",
    renotify: true,
    data: { url: dados.url || "/dashboard", tipo: dados.tipo },
    timestamp: dados.hora ? Date.parse(dados.hora) : Date.now(),
    vibrate: dados.tipo === "pagamento_aprovado" ? [40, 30, 40, 30, 80] : [60],
  };

  evento.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, opcoes),
      // Confirma que o aviso APARECEU: o serviço de push aceita (201) até para
      // app desinstalado. Falha calada — o aviso já foi mostrado.
      self.registration.pushManager
        .getSubscription()
        .then((inscricao) =>
          inscricao
            ? fetch("/api/push/recebido", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: inscricao.endpoint, envio: dados.envio }),
              })
            : null
        )
        .catch(() => {}),
    ])
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/dashboard";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes(destino) && "focus" in janela) return janela.focus();
      }
      if (janelas.length > 0 && "navigate" in janelas[0]) {
        return janelas[0].navigate(destino).then((j) => j && j.focus());
      }
      return self.clients.openWindow(destino);
    })
  );
});
