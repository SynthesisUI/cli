import type { ComponentRecipe, RegistryPayload } from "./types.js";

const kebab = (v: string) =>
  v.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const list = (items: string[]) =>
  items.length ? items.map((i) => `\`${i}\``).join(", ") : "_(none)_";

const dataAttrs = (variants: Record<string, Record<string, unknown>>) =>
  Object.entries(variants).map(
    ([axis, opts]) => `data-${kebab(axis)}="${Object.keys(opts).join("|")}"`,
  );

// Famílias genéricas do CSS - fallbacks, não webfonts a carregar.
const GENERIC_FAMILIES = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  "inherit",
  "initial",
]);

/** Famílias custom do documento (display/body/mono), deduplicadas, sem genéricos. */
function customFontFamilies(families: {
  display: string;
  body: string;
  mono: string;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const family of [families.display, families.body, families.mono]) {
    const name = family?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (GENERIC_FAMILIES.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** One entry per component: class, variant data-*, states, and multi-part anatomy. */
function componentEntry(cname: string, recipe: ComponentRecipe): string {
  const cls = `.ds-${kebab(cname)}`;
  const axes = dataAttrs(recipe.variants).map((a) => `\`${a}\``);
  const variantsText = axes.length ? ` - variants: ${axes.join(", ")}` : "";

  const states = Object.keys(recipe.states ?? {});
  const statesText = states.length ? `\n  states: ${list(states)}` : "";

  const partEntries = Object.entries(recipe.parts ?? {});
  let partsText = "";
  if (partEntries.length) {
    const items = partEntries.map(([pname, part]) => {
      const pcls = `.ds-${kebab(cname)}-${kebab(pname)}`;
      const paxes = dataAttrs(part.variants ?? {});
      return paxes.length ? `\`${pcls}\` (${paxes.join(", ")})` : `\`${pcls}\``;
    });
    partsText = `\n  parts: ${items.join(", ")}`;
  }

  return `- **${cname}** (\`${cls}\`)${variantsText}\n  ${recipe.description}${partsText}${statesText}`;
}

/**
 * Builds GUIDE.md - instructions *for the agent* on how to build components
 * that follow the design system. This is the piece that makes "I create the
 * components with claude-code" work: the tokens alone are not enough, the agent
 * needs the rules and the real vocabulary (semantic token names and recipes).
 */
export function buildGuide(payload: RegistryPayload): string {
  const { document: doc, slug, name, version } = payload;
  const { meta, foundations, motion, components } = doc;

  const semanticRoles = Object.keys(foundations.color.semantic);
  const seriesKeys = Object.keys(foundations.color.series ?? {});
  const fontFamilies = customFontFamilies(foundations.typography.families);
  const fontsHref =
    fontFamilies.length > 0
      ? `https://fonts.googleapis.com/css2?${fontFamilies
          .map((n) => `family=${n.replace(/ /g, "+")}:wght@400;500;600;700`)
          .join("&")}&display=swap`
      : null;
  const fontsSection = fontsHref
    ? `
## Fonts

This system's type relies on ${list(fontFamilies)} - **the DS ships token names, not the
fonts themselves.** If you don't load them they fall back to a generic family and the system loses
its typographic identity. Load them once (any one approach):

- **Google Fonts** - drop in your \`<head>\` (or root layout):
  \`\`\`html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${fontsHref}" />
  \`\`\`
- **Next.js** (\`next/font/google\`), **Fontsource**, or self-hosted \`@font-face\` work too - just
  register the families above. If a family isn't on Google Fonts, self-host it.

---
`
    : "";
  const weights = Object.keys(foundations.typography.weights);
  const hasAlt =
    foundations.color.semanticAlt &&
    Object.keys(foundations.color.semanticAlt).length > 0;
  const altScheme = meta.scheme === "light" ? "dark" : "light";
  const hasTailwind = "theme.css" in payload.artifacts;
  const hasParts = Object.values(components).some(
    (r) => r.parts && Object.keys(r.parts).length > 0,
  );

  const componentLines = Object.entries(components).map(([cname, recipe]) =>
    componentEntry(cname, recipe),
  );

  // Engagement blocks (gamification library) - category apart from core components.
  const blockEntries = Object.entries(doc.blocks ?? {});
  const blockLines = blockEntries.map(([bname, recipe]) =>
    componentEntry(bname, recipe),
  );

  const artifactList = Object.keys(payload.artifacts)
    .map((f) => `\`${f}\``)
    .join(", ");

  const layoutNames = Object.keys(doc.layouts ?? {});
  const pagesSection =
    layoutNames.length > 0
      ? `
## Full pages (templates)

This system ships whole-page templates: ${layoutNames.map((n) => `\`${n}\``).join(", ")}.

Materialize one as a real file:
\`\`\`bash
synthesisui page ${slug} ${layoutNames[0]}                 # Next .tsx + .css (default)
synthesisui page ${slug} ${layoutNames[0]} --target general  # single self-contained HTML
\`\`\`
It writes a **deterministic scaffold**: the page uses this DS's \`.ds-*\` recipe classes + layout
path-classes, paired with a co-located scoped CSS (Next target) that carries the **responsive** media
queries and the **CSS-only hamburger** - so the page is mobile-ready out of the box. **Refine it in
place** - wire real data, split into components, swap the chart/icon/media placeholders - but keep the
\`data-ds="${slug}"\` wrapper and the \`.ds-*\` / layout classes so it stays on-system. Run
\`synthesisui init\` once to set the target (next/general) and the output folder.

---
`
      : "";

  const hasRules = (payload.rules?.length ?? 0) > 0;
  const philosophy = payload.document.philosophy;
  const hasPhilosophy =
    (philosophy?.sections?.length ?? 0) > 0 || !!philosophy?.context;
  const readFirst = [
    hasRules
      ? `**Read \`_synthesisui/ds/${slug}/rules.md\` FIRST and obey it above everything else** - it carries this system's accumulated, project-specific rules; on any conflict they win.`
      : "",
    hasPhilosophy
      ? `**Then read \`_synthesisui/ds/${slug}/philosophy.md\`** - the mission, principles, voice and motion doctrine. Let it shape every screen you build.`
      : "",
  ].filter(Boolean);
  const rulesNote =
    readFirst.length > 0
      ? `
## Read first - highest authority

${readFirst.map((l) => `- ${l}`).join("\n")}

---
`
      : "";

  return `# Design System: ${name}

> Generated by \`synthesisui add ${slug}\` (v${version}). **Do not edit by hand** -
> run \`synthesisui add ${slug}\` again to update.

${meta.tagline}

**Mood:** ${meta.mood.join(" · ")}
**Default scheme:** ${meta.scheme}${hasAlt ? ` (supports a toggle to ${altScheme})` : ""}
${meta.sourceUrl ? `**Reinterpretation of:** ${meta.sourceUrl}` : "**Original system.**"}

${meta.narrative}

---
${rulesNote}
## How to apply

1. Import the tokens once in your project's global CSS:
   \`\`\`css
   @import "./_synthesisui/ds/${slug}/tokens.css";
   \`\`\`
   (adjust the relative path to where your CSS lives.)

2. Wrap the tree that should use the system with the scope attribute:
   \`\`\`html
   <div data-ds="${slug}">…your UI here…</div>
   \`\`\`
   All \`--ds-*\` custom properties and \`.ds-*\` classes only apply inside that scope.
   Applying \`data-ds="${slug}"\` at the app root (e.g. \`<body>\` or the root layout)
   is the simplest choice - the whole app then wears the system.
${
  hasAlt
    ? `
3. Light/dark: an ancestor with \`data-scheme="${altScheme}"\` switches the neutral roles to the opposite mode.
   \`\`\`tsx
   <div data-scheme="${altScheme}"><div data-ds="${slug}">…</div></div>
   \`\`\`
   A theme toggle just adds/removes that attribute on the scope element:
   \`\`\`tsx
   root.toggleAttribute("data-scheme"); // present = ${altScheme}, absent = ${meta.scheme}
   \`\`\`
`
    : ""
}${fontsSection}${
  hasTailwind
    ? `
## Styling with Tailwind v4 (preferred in this project)

Import \`theme.css\` after \`tailwindcss\` and \`tokens.css\`:
\`\`\`css
@import "tailwindcss";
@import "./_synthesisui/ds/${slug}/tokens.css";
@import "./_synthesisui/ds/${slug}/theme.css";
\`\`\`
This maps the DS tokens onto Tailwind's theme, so inside \`[data-ds="${slug}"]\` you get utilities
backed by the design system: \`bg-*\`/\`text-*\`/\`border-*\` (semantic colors), \`p-*\`/\`m-*\`/\`gap-*\`
(spacing), \`rounded-*\`, \`shadow-*\`, \`font-*\` (families **and** weights), \`text-*\` (type scale), \`ease-*\`${
        seriesKeys.length > 0
          ? `, \`bg-series-*\`/\`text-series-*\`/\`fill-series-*\` (data-viz series)`
          : ""
      }.

**Prefer these utilities for layout and new composition** - they are this project's idiom and read
far better than inline \`style\`. Reach for inline \`var(--ds-*)\` only when no utility fits.

\`\`\`tsx
// ✅ preferred - Tailwind utilities backed by the DS
<main className="bg-canvas text-foreground p-2xl flex flex-col gap-md">
  <button className="ds-button" data-intent="primary">Save</button>
</main>

// ❌ avoid - inline styles with raw var() when a utility exists
<main style={{ background: "var(--ds-color-semantic-canvas)", padding: "var(--ds-spacing-2xl)" }}>
\`\`\`

---
`
    : ""
}
This is **v${version}**. The stable entrypoints at \`_synthesisui/ds/${slug}/\` (the
\`tokens.css\`/\`theme.css\` re-exports, plus \`.lock\`) always point at the active version - import
those, not the versioned ones. The pinned files for this version - ${artifactList},
\`design-system.json\` (canonical source of truth), \`GUIDE.md\` (this file) - live in
\`_synthesisui/ds/${slug}/v${version}/\`.

---
${pagesSection}
## Building with the system

**This system is for building real product UI** - pages, layouts, dashboards, whole flows.
Compose the \`.ds-*\` recipes (and their parts) together with the DS-backed utilities to assemble
actual screens. There is **no "samples only" rule**: build the real app. An
\`app/synthesisui-samples/<component>/\` page is a fine *optional* scratch space to eyeball a single
component, but it is never required.

### Layout & composition
The system defines the scale; these are sensible defaults for spending it:
- **Page gutter / container padding:** a large spacing step - ${list(
    Object.keys(foundations.spacing).filter((k) => /xl/.test(k)),
  )}.
- **Section gaps:** \`lg\` (or the nearest large step). **Card/panel padding:** \`md\`.
- **Field / tight gaps:** \`2xs\`/\`3xs\`.
- The system imposes no content max-width - cap long-form/text columns yourself for readability.
${
  hasParts
    ? `
### Multi-part components
Components that have **parts** compile to \`.ds-<name>-<part>\` classes you nest yourself; the exact
part classes and their \`data-*\` are listed per component below. Example - a table:
\`\`\`tsx
<table className="ds-table">
  <thead className="ds-table-head">
    <tr>
      <th className="ds-table-cell-head">Name</th>
      <th className="ds-table-cell-head" data-align="end">Updated</th>
    </tr>
  </thead>
  <tbody>
    <tr className="ds-table-row">
      <td className="ds-table-cell">Halogen</td>
      <td className="ds-table-cell" data-align="end">2h ago</td>
    </tr>
  </tbody>
</table>
\`\`\`
`
    : ""
}
### Overlays & portals
Dialogs, menus and toasts are often rendered through a portal at the end of \`<body>\` - **outside**
your \`data-ds\` scope. Since \`.ds-*\`/\`--ds-*\` only resolve inside the scope, wrap any portalled UI
in its own \`<div data-ds="${slug}"${hasAlt ? ` data-scheme="…"` : ""}>\`, or apply \`data-ds\` at the
app root so everything (portals included) inherits it. Behavior (open/close, focus trap, positioning,
keyboard) is yours to wire - the system ships the **looks**, not the JavaScript.

### Interactive recipes - the behavior contract
Several recipes are **static surfaces**: they ship the styling for every state, but never any
JavaScript. You own the interaction and drive each state by toggling the documented \`data-*\`
attributes (listed per component below). The recipe restyles itself; you wire the logic.
- **Open / close** (menu, select, modal, tooltip, popover): render the surface, then handle show/hide,
  outside-click, focus trap, positioning and \`Esc\` yourself (or with a headless lib).
- **Selection / active** (tabs, sidebar, pagination): set \`data-active="true"\` on the chosen item from
  your own state/router - the recipe lifts it onto a surface.
- **On / off** (switch): toggle \`data-state="on"\` on the track **and** its thumb together.
- **Command bar / ⌘K** (if your system ships one): the recipe is only the styled input row - wire the
  shortcut, the palette list and filtering yourself.
- **Select** (native vs custom): \`.ds-select\` strips native chrome (\`appearance:none\`). On a real
  \`<select>\`, wrap it and overlay your own chevron; on a custom trigger, nest \`.ds-select-chevron\`.

Pair these with the right ARIA (\`aria-expanded\`, \`role="dialog"\`, \`aria-current\`, …) - the system
styles it, you make it work.

---

## Rules (follow them when creating components)
${
  hasTailwind
    ? `
- **Styling mechanism:** prefer Tailwind utilities backed by the DS (\`bg-primary\`, \`p-md\`,
  \`font-display\`, \`font-medium\`, …) for layout and new composition, and reuse the \`.ds-*\` recipes
  for components the DS already covers. Use inline \`style\` with \`var(--ds-*)\` only as a last resort.
  The token names below are the source vocabulary - every utility derives from them.`
    : ""
}
- **Always use semantic tokens**, never raw values nor primitives directly.
  Color: \`var(--ds-color-semantic-<role>)\`${hasTailwind ? " (utility: `bg-<role>`/`text-<role>`)" : ""}. The roles are: ${list(semanticRoles)}.
- Primitives (\`--ds-color-<palette>-<step>\`) exist but should **not** be referenced directly -
  they feed the semantic roles.${
    seriesKeys.length > 0
      ? `\n- Data-viz → \`var(--ds-color-series-<n>)\`${hasTailwind ? " (utility: `bg-series-<n>`/`text-series-<n>`/`fill-series-<n>`)" : ""}: categorical chart/series colors, ${seriesKeys.length} of them (${list(seriesKeys)}). Use them in order for multi-series charts; they re-paint with the system.`
      : ""
  }
- Spacing → \`var(--ds-spacing-<key>)\`: ${list(Object.keys(foundations.spacing))}.
- Radius → \`var(--ds-radius-<key>)\`: ${list(Object.keys(foundations.radius))}.
- Shadow → \`var(--ds-shadow-<key>)\`: ${list(Object.keys(foundations.shadow))}.
- Typography: families \`--ds-typography-families-{display,body,mono}\` (${foundations.typography.families.display}, ${foundations.typography.families.body}, ${foundations.typography.families.mono});
  weights${hasTailwind ? " (utility: `font-<key>`)" : ""}: ${list(weights)};
  scale \`--ds-typography-scale-<key>-font-size\`${hasTailwind ? " (utility: `text-<key>`)" : ""}: ${list(Object.keys(foundations.typography.scale))}.
- Motion: durations \`--ds-motion-durations-<key>\` (${list(Object.keys(motion.durations))}) and
  easings \`--ds-motion-easings-<key>\` (${list(Object.keys(motion.easings))}). Use them on
  \`transition\`/\`animation\` (e.g. \`transition: color var(--ds-motion-durations-fast) var(--ds-motion-easings-standard)\`)
  so timing stays on-brand. The DS ships timing tokens, **not** a runtime - for entrance/reveal/stagger
  pair them with a motion lib (e.g. \`motion\`/Framer) or CSS \`@keyframes\`.
- When **creating a new component** the DS does not cover yet: compose it from these semantic
  tokens to inherit the system's identity; do not invent colors/measures outside the scale.

---

## Ready-made components

Each recipe becomes a \`.ds-<name>\` class (inside the \`[data-ds="${slug}"]\` scope). Variants are
\`data-<axis>="<option>"\` attributes; states (hover/focus/active/disabled) ship in the CSS;
multi-part components expose \`.ds-<name>-<part>\` classes (listed under each).

${componentLines.join("\n\n")}
${
  blockEntries.length
    ? `
---

## Engagement blocks (optional)

A small gamification library the AI advisor (\`synthesisui advise\`) can propose - same
\`.ds-<name>\` recipe shape as the components above, token-only so they wear the system. Use them
**only where they fit the product** (progress, retention, recognition); they're a library to compose
from, not a default - and lean against over-gamifying a serious B2B product. Each is a \`.ds-<name>\`
class inside the \`[data-ds="${slug}"]\` scope; multi-part ones expose \`.ds-<name>-<part>\`.

${blockLines.join("\n\n")}
`
    : ""
}
---

_Full canonical source of truth (including values and keyframes) in \`design-system.json\`._
`;
}
