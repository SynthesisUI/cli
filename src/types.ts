/**
 * Minimal mirror of the registry contract — the CLI is standalone and does NOT
 * import `@synthesisui-hub/ds-contracts` (it only consumes the endpoint JSON).
 * We type only what the CLI reads to generate GUIDE.md and the .lock.
 */

export type RegistrySummary = {
  slug: string;
  name: string;
  version: number;
  status: string;
};

export type StyleBlock = Record<string, string>;

export type ComponentPart = {
  base: StyleBlock;
  variants?: Record<string, Record<string, StyleBlock>>;
  states?: Record<string, StyleBlock>;
};

export type ComponentRecipe = {
  description: string;
  base: StyleBlock;
  variants: Record<string, Record<string, StyleBlock>>;
  states?: Record<string, StyleBlock>;
  parts?: Record<string, ComponentPart>;
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
      series?: Record<string, string>;
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
  /** Biblioteca de blocos de engajamento (token-only) — categoria à parte. */
  blocks?: Record<string, ComponentRecipe>;
};

export type RegistryPayload = RegistrySummary & {
  document: DesignSystemDocument;
  artifacts: Record<string, string>;
};

/** Resposta de `POST /api/ai/advisor` (advisor de engajamento — propõe, não executa). */
export type AdvisorProposal = {
  pattern: string;
  rationale: string;
  suggestedBlocks: string[];
};

export type AdvisorResponse = {
  proposals: AdvisorProposal[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};
