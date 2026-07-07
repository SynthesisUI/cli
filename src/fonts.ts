import type { DesignSystemDocument } from "./types.js";

/**
 * Carregamento de fontes para o consumidor. Espelha o `DsFontLink` da
 * plataforma (apps/web): o DS entrega NOMES de família (tokens), não as fontes -
 * sem carregá-las, o display/body caem em fallback e a identidade some. O `add`
 * usa isto pra imprimir o `<link>` do Google Fonts como passo explícito de
 * setup (antes ficava só, passivo, no GUIDE.md).
 */

type Families = DesignSystemDocument["foundations"]["typography"]["families"];

// Fallbacks genéricos do CSS - não são webfonts.
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

/** Famílias CUSTOM (display/body/mono), dedup e sem os genéricos. */
export function customFontFamilies(families: Families): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const family of [families.display, families.body, families.mono]) {
    const name = family?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (GENERIC_FAMILIES.has(key) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** URL do Google Fonts CSS2 pras famílias do documento, ou null se só genéricos. */
export function googleFontsHref(families: Families): string | null {
  const names = customFontFamilies(families);
  if (names.length === 0) return null;
  const query = names
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/**
 * The RECOMMENDED wiring for Next apps: `next/font` self-hosts the families
 * (preloaded, size-adjusted fallbacks - no FOUT "blink" on refresh), and a
 * small CSS block re-points the DS's family tokens to next/font's variables.
 * Returns null when the doc only uses generic families. The naive
 * `<link href="fonts.googleapis.com...">` stays as the framework-agnostic
 * fallback - it works everywhere but swaps visibly on cold loads.
 */
export function nextFontSnippet(
  families: Families,
  slug: string,
): { fontsFile: string[]; layout: string[]; css: string[] } | null {
  const roles = (["display", "body", "mono"] as const).filter((role) => {
    const name = families[role]?.trim();
    return name && !GENERIC_FAMILIES.has(name.toLowerCase());
  });
  if (roles.length === 0) return null;

  const importName = (name: string) => name.trim().replace(/ /g, "_");
  const seen = new Map<string, string>(); // family name -> const name
  const importNames: string[] = [];
  const consts: string[] = [];
  for (const role of roles) {
    const name = (families[role] as string).trim();
    if (!seen.has(name)) {
      seen.set(name, role);
      importNames.push(importName(name));
      consts.push(
        `export const ${seen.get(name)} = ${importName(name)}({`,
        `  subsets: ["latin"],`,
        `  variable: "--font-ds-${seen.get(name)}",`,
        `});`,
      );
    }
  }

  const fontsFile = [
    `// app/fonts.ts`,
    `import { ${importNames.join(", ")} } from "next/font/google";`,
    ...consts,
  ];
  const roleVar = (role: string) => {
    const name = (families[role as "display"] as string).trim();
    return `--font-ds-${seen.get(name)}`;
  };
  const layout = [
    `// app/layout.tsx`,
    `import { ${[...new Set(roles.map((r) => seen.get((families[r] as string).trim())))].join(", ")} } from "./fonts";`,
    `<body data-ds="${slug}" className={\`${[...new Set(roles.map((r) => `\${${seen.get((families[r] as string).trim())}.variable}`))].join(" ")}\`}>`,
  ];
  const css = [
    `/* app/globals.css - AFTER the tokens.css import */`,
    `[data-ds="${slug}"] {`,
    ...roles.map(
      (role) => `  --ds-typography-families-${role}: var(${roleVar(role)});`,
    ),
    `}`,
  ];
  return { fontsFile, layout, css };
}
