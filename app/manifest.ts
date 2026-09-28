import type { MetadataRoute } from "next";

// Permite instalar o painel na tela inicial do celular — condição do iPhone
// para receber notificação, e o que faz o aviso chegar melhor no Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlphaNexus Dashboard",
    short_name: "AlphaNexus",
    description: "Vendas, entregas e cobrança da sua operação",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
