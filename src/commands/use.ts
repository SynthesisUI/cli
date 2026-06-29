import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readProjectConfig } from "../config.js";

type UseOptions = {
  /** Consumer project root (default: cwd). */
  dir?: string;
};

/** Root pointer written by `add` - tells us the active version + display name. */
type RootLock = {
  slug: string;
  name: string;
  version: number;
};

async function readRootLock(path: string): Promise<RootLock | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RootLock;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * `synthesisui use <slug> "<intent>"` - the platform↔app bridge (INS-10).
 *
 * Reads only LOCAL state (the installed `.lock`, the project `config.json`, and
 * which guidance files exist) and prints a ready-to-paste prompt for your coding
 * agent (Claude Code, Cursor, …) describing the task **on-system**: which files
 * to read first, the scope attribute, the styling contract, and where files go.
 * Works for both *bringing in* new UI ("a pricing section with 3 tiers") and
 * *modifying* existing UI ("make the card shadow softer in components/Card.tsx").
 *
 * No network: the DS must already be installed (`synthesisui add <slug>`).
 */
export async function use(
  slug: string,
  intent: string,
  opts: UseOptions,
): Promise<void> {
  const root = opts.dir ?? process.cwd();
  const slugDir = join(root, "_synthesisui", "ds", slug);

  const lock = await readRootLock(join(slugDir, ".lock"));
  if (!lock) {
    console.error(
      `error: "${slug}" is not installed in this project.\n` +
        `  run \`synthesisui add ${slug}\` first (brings tokens.css + GUIDE.md), then retry.`,
    );
    process.exitCode = 1;
    return;
  }

  const config = await readProjectConfig(root);
  const { version, name } = lock;
  const base = `_synthesisui/ds/${slug}`;

  // Highest-authority guidance first; only list files that actually exist.
  const hasRules = await exists(join(slugDir, "rules.md"));
  const hasPhilosophy = await exists(join(slugDir, "philosophy.md"));
  const readFirst = [
    hasRules
      ? `- ${base}/rules.md — project rules for this system; obey them above everything else`
      : "",
    hasPhilosophy
      ? `- ${base}/philosophy.md — the mission, voice and principles; let it shape every screen`
      : "",
    `- ${base}/v${version}/GUIDE.md — how to apply the system, the recipes and the token vocabulary`,
  ].filter(Boolean);

  // The styling contract differs by target: Next projects in this product use
  // Tailwind v4 backed by the DS; the "general" target is framework-agnostic CSS.
  const stylingRule =
    config.target === "general"
      ? `- Style with the design system only: reuse the \`.ds-*\` recipe classes and the ` +
        `\`var(--ds-*)\` custom properties. Never use raw hex/px outside the system's scale.`
      : `- Style with the design system only: reuse the \`.ds-*\` recipe classes and the ` +
        `DS-backed Tailwind utilities (\`bg-primary\`, \`text-foreground\`, \`p-md\`, \`rounded-lg\`, ` +
        `\`font-display\`…). Never use raw hex/px outside the system's scale.`;

  const task = intent.trim() || "build the UI I describe next";

  const prompt = [
    `Use the "${name}" design system (slug: ${slug}, v${version}) to: ${task}`,
    "",
    "Read these files in the project first (highest authority first):",
    ...readFirst,
    "",
    "Follow this contract:",
    `- Scope the markup with \`data-ds="${slug}"\` (or rely on it at the app root).`,
    stylingRule,
    `- Target framework: ${config.target}. Put new components in \`${config.componentsDir}/\` ` +
      `and pages in \`${config.pagesDir}/\`.`,
    config.target === "next"
      ? '- Make sure `tokens.css` + `theme.css` are imported in the global CSS (see the GUIDE\'s "How to apply").'
      : '- Make sure `tokens.css` is imported in the global CSS (see the GUIDE\'s "How to apply").',
    "- Wire the behavior yourself (open/close, focus, routing) - the system ships the looks, not the JS.",
    "",
    "Deliver senior-level, production-quality code: clean structure, accessible (ARIA + keyboard), and responsive.",
  ].join("\n");

  // Framing lines go to stderr so `synthesisui use … | pbcopy` copies only the
  // prompt itself (stdout), while the human still sees the guidance.
  console.error(`✓ ${name} v${version} · target ${config.target}\n`);
  console.error("Copy the prompt below and paste it to your coding agent:\n");
  console.error("──────────────────────────────────────────────────────────");
  console.log(prompt);
  console.error("──────────────────────────────────────────────────────────");
  console.error(
    "\nTip: `synthesisui use " +
      slug +
      ' "…" | pbcopy` (macOS) copies just the prompt.',
  );
}
