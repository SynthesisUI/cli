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
 * codegen-first): the server codegens deterministic files, we write them, and
 * the agent refines them in place. The page uses the DS's `.ds-*` classes +
 * path classes; the co-located CSS (Next target) carries the responsive media
 * queries + the CSS-only hamburger, so it re-vests once `tokens.css` is in.
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

  // --out targets the page (1st file); sibling files (e.g. the CSS) land in the
  // same directory. Without --out, everything goes under <pagesDir>.
  const [pageFile, ...siblings] = generated.files;
  const pageRel = opts.out ?? join(config.pagesDir, pageFile.filename);
  const pageDir = dirname(join(root, pageRel));

  await mkdir(pageDir, { recursive: true });
  await writeFile(join(root, pageRel), pageFile.code, "utf8");
  console.log(`✓ wrote ${pageRel}  (${slug} v${generated.version})`);

  for (const f of siblings) {
    const rel = opts.out
      ? join(dirname(pageRel), f.filename)
      : join(config.pagesDir, f.filename);
    await writeFile(join(root, rel), f.code, "utf8");
    console.log(`✓ wrote ${rel}`);
  }

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
    `  • keep the data-ds="${slug}" wrapper and the ds-* / layout classes (stays on-system)`,
  );
}
