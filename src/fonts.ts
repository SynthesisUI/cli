import type { DesignSystemDocument } from "./types.js";

/**
 * Carregamento de fontes para o consumidor. Espelha o `DsFontLink` da
 * plataforma (apps/web): o DS entrega NOMES de família (tokens), não as fontes -
 * sem carregá-las, o display/body caem em fallback e a identidade some. O `add`
 * usa isto pra imprimir o `<link>` do Google Fonts como passo explícito de
 * setup (antes ficava só, passivo, no GUIDE.md).
 */

type Families =
  DesignSystemDocument["foundations"]["typography"]["families"];

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
