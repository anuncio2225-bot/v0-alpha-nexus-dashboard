# Padrão de design — AlphaNexus Glass

Versão 2 (24/09/2026). Direção dada pelo dono com referências (dashboard "Quantix", fintech escuro):
**tecnológico, premium, com vida** — degradê, brilho, sombra, contraste, texto metálico, geometria
bem definida e bordas arredondadas, na paleta da marca (preto, grafite, branco e verde-esmeralda).

> A versão 1 (minimalista, "contida", seguindo a Impeccable no modo Operate) foi reprovada: "sem
> vida". Skill de design genérica é piso técnico, não direção estética.

## Linguagem

| Peça | Como é | Onde está |
|---|---|---|
| Fundo | preto grafite `#07080a` + luz verde no canto + grão fino | `body` em `app/globals.css` |
| Superfície | vidro escuro: degradê de cima pra baixo, borda `rgba(255,255,255,.07)`, reflexo interno, sombra funda, raio 16–20 px | `.surface` (já no `Card`) |
| Título | metálico (branco → aço), tracking −0,03em, grande e em duas linhas nas telas principais | `.text-metal`, todo `main h1` |
| Número | metálico que esmaece à direita; negativo em degradê vermelho | `.text-metal-fade` |
| Brilho | cada cartão tem um tom (verde, azul, âmbar, vermelho) que acende no fundo e no azulejo do ícone | `.ambient` + `--tone`, `.icon-tile` + `--tile` |
| Botão primário | verde com volume (degradê + reflexo + brilho) | `.btn-glow` (variante `default`) |
| Botão secundário | vidro | `.btn-glass` (variantes `outline` e `secondary`) |
| Menu ativo | pílula de vidro com reflexo no topo + barrinha verde brilhando | `components/layout/sidebar.tsx` |
| Movimento | faixa de vendas correndo, ponto "ao vivo" pulsando, mini-gráficos que se desenham, cartão que acende sob o mouse | `.marquee`, `.live-dot`, `.sparkline-draw`, `GlowCard` |

## Regras que continuam valendo

1. **Mesmo tamanho na mesma fileira.** Destaques em 5 (ou 3+2 com colunas explícitas, nunca buraco),
   métricas em grade de 12 (divide por 2, 3, 4 e 6).
2. **Toda tela cabe em 390 px** sem rolar para o lado — medir, não olhar.
3. **Número em pt-BR:** vírgula decimal, `formatCurrency` / `formatPercent`, nunca `toFixed()` cru na tela.
4. **Cor tem significado:** verde = entrada/marca, azul = agendado/informativo, âmbar = investimento/atenção,
   vermelho = negativo/perda. O brilho segue o tom.
5. **Estado vazio escrito** (o que aparece ali quando houver dado), nunca gráfico vazio só com eixo.
6. **Sem roxo/índigo** (a marca é verde) e sem texto de mentira (`********`, lorem ipsum).
7. **Movimento curto** (≤ 300 ms nas interações, curva `cubic-bezier(0.23,1,0.32,1)`) e respeitando
   `prefers-reduced-motion`.

## Antes de dizer que está pronto

- Print em 1440 e 390 px, olhado — inclusive a peça isolada quando o print de página inteira mente.
- Medição de "vaza para o lado" nas telas mexidas.
- Tema claro não quebrou (o metal tem versão clara em `.light`).
