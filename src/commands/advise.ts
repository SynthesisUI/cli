import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRegistry } from "../config.js";
import { postAdvisor } from "../registry.js";
import { buildRepoContext } from "../repo-context.js";

type AdviseOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
};

/**
 * Component names of the design system(s) installed in this project (from each
 * DS's design-system.json). Grounds the advisor in what the DS ACTUALLY has, so
 * it prefers real blocks and flags missing ones (instead of a fixed vocabulary).
 */
async function installedBlocks(root: string): Promise<string[]> {
  const dsRoot = join(root, "_synthesisui", "ds");
  const blocks = new Set<string>();
  let slugs: string[] = [];
  try {
    const entries = await readdir(dsRoot, { withFileTypes: true });
    slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  for (const slug of slugs) {
    try {
      const lockRaw = await readFile(join(dsRoot, slug, ".lock"), "utf8");
      const version = (JSON.parse(lockRaw) as { version?: number }).version ?? 1;
      const docRaw = await readFile(
        join(dsRoot, slug, `v${version}`, "design-system.json"),
        "utf8",
      );
      const doc = JSON.parse(docRaw) as {
        components?: Record<string, unknown>;
      };
      for (const name of Object.keys(doc.components ?? {})) blocks.add(name);
    } catch {
      // skip a DS we can't read - the advisor still works without its catalog
    }
  }
  return [...blocks].sort();
}

/**
 * Asks the hosted advisor for engagement-pattern proposals, grounded in THIS
 * project (the CLI gathers a compact repo summary) + the value proposition you
 * pass. The advisor proposes only - it changes nothing in your project.
 */
export async function advise(
  valueProp: string,
  opts: AdviseOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  const repo = await buildRepoContext(root);
  const blocks = await installedBlocks(root);
  const catalog = blocks.length
    ? `\n\nDesign-system blocks available in this project (prefer these; anything else can be created with \`synthesisui generate\`): ${blocks.join(", ")}`
    : "";
  const context = `Value proposition: ${valueProp}\n\n${repo}${catalog}`;

  console.log(`→ asking the advisor at ${base} …`);
  const res = await postAdvisor(base, context);

  if (res.proposals.length === 0) {
    console.log("No proposals returned.");
    return;
  }

  console.log(`\nEngagement proposals (${res.model}):\n`);
  res.proposals.forEach((p, i) => {
    console.log(`${i + 1}. ${p.pattern}`);
    console.log(`   ${p.rationale}`);
    if (p.suggestedBlocks.length) {
      console.log(`   blocks: ${p.suggestedBlocks.join(", ")}`);
    }
    console.log("");
  });

  console.log(
    `(${res.usage.inputTokens} in / ${res.usage.outputTokens} out tokens - ` +
      `proposals only; nothing in your project was changed)`,
  );
}
