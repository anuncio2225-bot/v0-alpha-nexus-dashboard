# Padrão de design — AlphaNexus

Versão 1 (23/09/2026), antes das referências do dono. Tira a "cara de IA" sem trocar a identidade
(escuro + verde-esmeralda). Fontes: método das 3 camadas (regra, referência, olhos) e as skills
Impeccable (Paul Bakaus), Taste Skill (Leonxlnx) e Design Engineering (Emil Kowalski).

O AlphaNexus é um painel de **operação**: a pessoa entra para fazer uma tarefa. Familiaridade e
leitura rápida valem mais que expressão. A marca mora nos detalhes precisos, não em enfeite.

## As 10 regras (conferíveis olhando a tela)

1. **Uma família tipográfica: Geist.** Títulos, rótulos, botões e números. A Syne só aparece no
   logotipo (`font-logo`).
2. **Número de dinheiro em fonte de tabela** (`tabular-nums`, já global em `table` e `.metric`),
   com vírgula decimal e "R$" no padrão pt-BR. Nunca `toFixed()` direto na tela: use
   `formatCurrency` / `formatPercent`.
3. **Cor só com significado.** Negativo em vermelho; zero apagado (`text-muted-foreground`);
   o resto na cor normal do texto. O verde da marca é para ação principal, item selecionado e
   estado, nunca para pintar número.
4. **Estado vazio escrito**, dizendo o que aparece ali quando houver dado. Nunca gráfico com eixos
   vazios, nunca gráfico de uma fatia só.
5. **Toda tela cabe em 390 px** sem rolagem para o lado. Tabela larga rola dentro do próprio cartão;
   barras de filtro e botões usam `flex-wrap`.
6. **PROIBIDO: ícone decorativo** no canto de cartão ou ao lado de título. Ícone só quando informa
   (status, ação de botão).
7. **PROIBIDO: roxo/índigo e texto em degradê.** Paleta: neutros + esmeralda + âmbar/vermelho de
   estado.
8. **PROIBIDO: animação de entrada** em blocos (fade-up, stagger), brilho ou cartão que "levanta"
   ao passar o mouse. Movimento só para mudança de estado, até 200 ms, curva
   `cubic-bezier(0.23, 1, 0.32, 1)`. Botão afunda ao clicar (`active:scale-[0.97]`).
9. **PROIBIDO: Title Case e "ⓘ" em todo rótulo.** Texto em caixa de frase ("Quarta-feira, 23 de
   setembro"). Explicação de métrica vai num sublinhado pontilhado no próprio rótulo.
10. **PROIBIDO: texto de mentira.** Nada de `********` como exemplo de senha, "Lorem ipsum" ou
    número redondo inventado. Exemplo de campo diz o que digitar ("Sua senha").

## Antes de dizer que uma tela está pronta

- Olhei o print em 1440 px e em 390 px (não só o código).
- Rodei a medição de "vaza para o lado" nas telas mexidas.
- Estado vazio, carregando e erro existem.
- Contraste de texto normal ≥ 4,5:1.

## Em aberto (decisão do dono)

- Referências visuais (3–5 sites) para a versão 2: tipografia de destaque, densidade, cor.
- Cor de fundo das linhas da Cobrança: vem da cor de cada status que o próprio usuário configura.
  Mantida; pode virar só a etiqueta do status.
