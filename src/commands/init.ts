import { DEFAULT_CONFIG, writeProjectConfig } from "../config.js";
import type { ProjectConfig } from "../types.js";

type InitOptions = {
  dir?: string;
  /** Framework target for materialized pages. */
  target?: string;
  /** Folder where generated pages are written. */
  pagesDir?: string;
};

/**
 * Writes `_synthesisui/config.json` - where `synthesisui page` materializes
 * pages and which framework to target. Committable; safe to re-run.
 */
export async function init(opts: InitOptions): Promise<void> {
  const root = opts.dir ?? process.cwd();
  const target: ProjectConfig["target"] =
    opts.target === "general" ? "general" : "next";
  const config: ProjectConfig = {
    target,
    pagesDir:
      opts.pagesDir ?? (target === "next" ? "app" : DEFAULT_CONFIG.pagesDir),
  };
  await writeProjectConfig(root, config);

  console.log("✓ wrote _synthesisui/config.json");
  console.log(`  target:   ${config.target}`);
  console.log(`  pagesDir: ${config.pagesDir}`);
  console.log("");
  console.log("Next steps:");
  console.log("  • synthesisui add <slug>            bring a design system in");
  console.log(
    "  • synthesisui page <slug> <template>  materialize a full page",
  );
}
