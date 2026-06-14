import type { RegistryPayload } from "./types.js";

const kebab = (v: string) =>
  v.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const list = (items: string[]) =>
  items.length ? items.map((i) => `\`${i}\``).join(", ") : "_(nenhum)_";

/**
 * Gera o GUIDE.md — instruções *para o agente* sobre como construir
 * componentes seguindo o DS. É a peça que faz "com claude-code eu crio os
 * componentes" funcionar: não basta os tokens, o agente precisa das regras
 * e do vocabulário real (nomes de tokens semânticos e de recipes).
 */
export function buildGuide(payload: RegistryPayload): string {
  const { document: doc, slug, name, version } = payload;
  const { meta, foundations, motion, components } = doc;

  const semanticRoles = Object.keys(foundations.color.semantic);
  const hasAlt =
    foundations.color.semanticAlt &&
    Object.keys(foundations.color.semanticAlt).length > 0;
  const altScheme = meta.scheme === "light" ? "dark" : "light";

  const componentLines = Object.entries(components).map(([cname, recipe]) => {
    const cls = `.ds-${kebab(cname)}`;
    const axes = Object.entries(recipe.variants).map(([axis, opts]) => {
      const options = Object.keys(opts);
      return `\`data-${kebab(axis)}="${options.join("|")}"\``;
    });
    const variantsText = axes.length ? ` — variantes: ${axes.join(", ")}` : "";
    return `- **${cname}** (\`${cls}\`)${variantsText}\n  ${recipe.description}`;
  });

  const artifactList = Object.keys(payload.artifacts)
    .map((f) => `\`${f}\``)
    .join(", ");

  return `# Design System: ${name}

> Gerado por \`synthesisui add ${slug}\` (v${version}). **Não edite à mão** —
> rode \`synthesisui add ${slug}\` de novo para atualizar.

${meta.tagline}

**Mood:** ${meta.mood.join(" · ")}
**Modo padrão:** ${meta.scheme}${hasAlt ? ` (suporta toggle para ${altScheme})` : ""}
${meta.sourceUrl ? `**Releitura de:** ${meta.sourceUrl}` : "**Sistema autoral.**"}

${meta.narrative}

---

## Como aplicar

1. Importe os tokens uma vez no CSS global do projeto:
   \`\`\`css
   @import "./_synthesisui/ds/${slug}/tokens.css";
   \`\`\`
   (ajuste o caminho relativo conforme a localização do seu CSS.)

2. Envolva a árvore que deve usar o sistema com o atributo de escopo:
   \`\`\`html
   <div data-ds="${slug}">…sua UI aqui…</div>
   \`\`\`
   Todas as custom properties \`--ds-*\` e as classes \`.ds-*\` só valem dentro desse escopo.
${
  hasAlt
    ? `
3. Light/dark: um ancestral com \`data-scheme="${altScheme}"\` troca os papéis neutros para o modo oposto.
   \`\`\`html
   <div data-scheme="${altScheme}"><div data-ds="${slug}">…</div></div>
   \`\`\`
`
    : ""
}
Artefatos disponíveis em \`_synthesisui/ds/${slug}/\`: ${artifactList}, \`design-system.json\` (verdade canônica), \`GUIDE.md\` (este arquivo).

---

## Regras (siga ao criar componentes)

- **Use SEMPRE tokens semânticos**, nunca valores crus nem primitivas diretas.
  Cor: \`var(--ds-color-semantic-<papel>)\`. Os papéis são: ${list(semanticRoles)}.
- Primitivas (\`--ds-color-<paleta>-<step>\`) existem mas **não** devem ser referenciadas direto —
  elas alimentam os papéis semânticos.
- Espaçamento → \`var(--ds-spacing-<key>)\`: ${list(Object.keys(foundations.spacing))}.
- Raio → \`var(--ds-radius-<key>)\`: ${list(Object.keys(foundations.radius))}.
- Sombra → \`var(--ds-shadow-<key>)\`: ${list(Object.keys(foundations.shadow))}.
- Tipografia: famílias \`--ds-typography-families-{display,body,mono}\` (${foundations.typography.families.display}, ${foundations.typography.families.body}, ${foundations.typography.families.mono});
  escala \`--ds-typography-scale-<key>-font-size\` etc.: ${list(Object.keys(foundations.typography.scale))}.
- Motion: durações \`--ds-motion-durations-<key>\` (${list(Object.keys(motion.durations))}) e
  easings \`--ds-motion-easings-<key>\` (${list(Object.keys(motion.easings))}).
- Ao **criar um componente novo** que o DS ainda não cobre: componha a partir desses tokens
  semânticos para herdar a identidade do sistema; não invente cores/medidas fora da escala.

---

## Onde testar/preview

**Preview isolado, nunca em página real.** Ao criar ou demonstrar um componente, gere uma página de
amostra dedicada — \`app/synthesisui-samples/<componente>/\` no Next.js App Router (ou a rota/pasta de
samples equivalente na stack do projeto). **Não** aplique o componente a páginas reais de produção
(home, layout, rotas existentes) a menos que seja explicitamente pedido. As amostras deixam revisar o
componente no contexto do design system sem tocar no app.

---

## Componentes prontos

Cada recipe vira uma classe \`.ds-<nome>\` (dentro do escopo \`[data-ds="${slug}"]\`).
Variantes são atributos \`data-<eixo>="<opção>"\`; estados (hover/focus/active/disabled) já vêm no CSS.

${componentLines.join("\n\n")}

---

_Verdade canônica completa (incluindo valores e keyframes) em \`design-system.json\`._
`;
}
