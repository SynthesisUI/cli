import { resolveRegistry } from "../config.js";
import { postAdvisor } from "../registry.js";
import { buildRepoContext } from "../repo-context.js";

type AdviseOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
};

/**
 * Asks the hosted advisor for engagement-pattern proposals, grounded in THIS
 * project (the CLI gathers a compact repo summary) + the value proposition you
 * pass. The advisor proposes only — it changes nothing in your project.
 */
export async function advise(
  valueProp: string,
  opts: AdviseOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  const repo = await buildRepoContext(root);
  const context = `Proposta de valor: ${valueProp}\n\n${repo}`;

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
    `(${res.usage.inputTokens} in / ${res.usage.outputTokens} out tokens — ` +
      `proposals only; nothing in your project was changed)`,
  );
}
