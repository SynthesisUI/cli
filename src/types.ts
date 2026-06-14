/**
 * Espelho mínimo do contrato do registry — o CLI é standalone e NÃO importa
 * `@synthesisui-hub/ds-contracts` (só consome o JSON do endpoint). Tipamos
 * apenas o que o CLI lê para gerar o GUIDE.md e o .lock.
 */

export type RegistrySummary = {
  slug: string;
  name: string;
  version: number;
  status: string;
};

export type StyleBlock = Record<string, string>;

export type ComponentRecipe = {
  description: string;
  base: StyleBlock;
  variants: Record<string, Record<string, StyleBlock>>;
  states?: Record<string, StyleBlock>;
  preview?: { kind: string; sampleText?: string };
};

export type DesignSystemDocument = {
  meta: {
    slug: string;
    name: string;
    tagline: string;
    narrative: string;
    mood: string[];
    sourceUrl: string | null;
    scheme: "light" | "dark";
  };
  foundations: {
    color: {
      primitives: Record<string, Record<string, string>>;
      semantic: Record<string, string>;
      semanticAlt?: Record<string, string>;
    };
    typography: {
      families: { display: string; body: string; mono: string };
      weights: Record<string, number>;
      scale: Record<string, Record<string, string>>;
    };
    spacing: Record<string, string>;
    radius: Record<string, string>;
    shadow: Record<string, string>;
    breakpoints: Record<string, string>;
  };
  motion: {
    durations: Record<string, string>;
    easings: Record<string, string>;
    keyframes: Record<string, unknown>;
    patterns: Record<string, { description: string; trigger: string }>;
  };
  components: Record<string, ComponentRecipe>;
};

export type RegistryPayload = RegistrySummary & {
  document: DesignSystemDocument;
  artifacts: Record<string, string>;
};
