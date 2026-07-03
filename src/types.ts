/**
 * Minimal mirror of the registry contract - the CLI is standalone and does NOT
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
  /** Biblioteca de blocos de engajamento (token-only) - categoria à parte. */
  blocks?: Record<string, ComponentRecipe>;
  /** Templates de página inteira - materializáveis via `synthesisui template`. */
  layouts?: Record<string, { kind?: string; description?: string }>;
  /** Bibliotecas de ícones referenciadas (ex.: lucide) - vira dep no GUIDE. */
  icons?: { libraries?: string[]; default?: string };
  /** Charts do DS (token-themed); presença vira dep de renderer no GUIDE. */
  charts?: Record<string, unknown>;
  /** Filosofia estruturada (Pilar 4) → materializada em `philosophy.md`. */
  philosophy?: {
    context?: string;
    sections?: { key: string; title: string; body: string }[];
  };
};

export type RegistryPayload = RegistrySummary & {
  document: DesignSystemDocument;
  artifacts: Record<string, string>;
  /** Regras de governança (DS pessoal) → materializadas em `rules.md`. */
  rules?: string[];
};

/** Resposta de `POST /api/ai/advisor` (advisor de engajamento - propõe, não executa). */
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

/** Um arquivo gerado: caminho relativo + conteúdo. */
export type GeneratedFile = {
  filename: string;
  code: string;
};

/** Resposta de `GET /api/registry/ds/<slug>?page=<t>&target=<next|general>`. */
export type GeneratedPage = {
  slug: string;
  version: number;
  template: string;
  target: "next" | "general";
  /** Página + (no target Next) o CSS escopado co-locado. O 1º é a página. */
  files: GeneratedFile[];
};

/** `_synthesisui/config.json` - escrito por `init`, lido por `page`/`component`. */
export type ProjectConfig = {
  /** Alvo de materialização (hoje: Next ou HTML genérico). */
  target: "next" | "general";
  /** Pasta onde as páginas geradas são escritas (ex.: "app"). */
  pagesDir: string;
  /** Pasta onde os componentes vivem (o agente escreve os recipes aqui). */
  componentsDir: string;
  /**
   * Como `component` materializa o código gerado:
   * - "css" (default): TSX fino + <name>.css colocado (só classes ds-*
   *   referenciando os tokens) - atualizar o css re-veste o componente.
   * - "tailwind": TSX com utilities inline resolvidas pelo adapter `theme.css`
   *   (@theme) - o código é seu; tokens ainda propagam via vars.
   */
  styles: "css" | "tailwind";
};

/** Resposta de `POST /api/ai/generate` (chat-gen PRO - recipe token-only validada). */
export type GenerateResponse = {
  name: string;
  recipe: ComponentRecipe;
  css: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  tries: number;
};

/** Resposta de `?component=<name>` - UM componente do DS (recipe + CSS compilado). */
export type FetchedComponent = {
  slug: string;
  version: number;
  name: string;
  recipe: ComponentRecipe;
  css: string;
};

/** Resposta de `?changelog&from=N[&to=M]` (Marco B). O CLI consome o markdown
 *  pronto + o resumo estruturado; o diff em si é calculado no servidor. */
export type ChangelogResponse = {
  slug: string;
  from: number;
  to: number;
  changelog: {
    tokens: unknown[];
    components: { name: string; kind: string }[];
    blocks: { name: string; kind: string }[];
    layouts: { name: string; kind: string }[];
    charts: { name: string; kind: string }[];
    breaking: string[];
    isEmpty: boolean;
  };
  markdown: string;
};
