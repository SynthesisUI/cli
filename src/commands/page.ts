import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readProjectConfig, resolveRegistry } from "../config.js";
import { fetchPage } from "../registry.js";

type PageOptions = {
  registry?: string;
  dir?: string;
  /** Override the output path (relative to project root or absolute). */
  out?: string;
  /** Override the framework target (defaults to the project config). */
  target?: string;
  /** Specific DS version (latest when omitted). */
  version?: number;
};

/**
 * Materializes a whole page from a DS template into the project (hybrid
 * codegen-first): the server codegens a deterministic file, we write it, and
 * the agent refines it in place. The page uses the DS's `.ds-*` classes +
 * inline token vars, so it re-vests once `tokens.css` is imported.
 */
export async function page(
  slug: string,
  template: string,
  opts: PageOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();
  const config = await readProjectConfig(root);
  const target =
    opts.target === "general" || opts.target === "next"
      ? opts.target
      : config.target;

  console.log(`→ generating "${template}" from "${slug}" (${target}) …`);
  const generated = await fetchPage(base, slug, template, target, opts.version);

  // --out wins; otherwise <pagesDir>/<filename> (e.g. app/dashboard.tsx).
  const relPath = opts.out ?? join(config.pagesDir, generated.filename);
  const outPath = join(root, relPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, generated.code, "utf8");

  console.log(`✓ wrote ${relPath}  (${slug} v${generated.version})`);
  console.log("");
  console.log("Next steps:");
  console.log(
    `  • ensure the DS is installed: synthesisui add ${slug} (provides tokens.css)`,
  );
  console.log(
    `  • @import "_synthesisui/ds/${slug}/tokens.css" in your global CSS`,
  );
  console.log(
    "  • refine the file: wire real data, split into components, swap placeholders",
  );
  console.log(
    `  • keep the data-ds="${slug}" wrapper and the ds-* classes (stays on-system)`,
  );
}
