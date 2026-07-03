import { DEFAULT_CONFIG, writeProjectConfig } from "../config.js";
import type { ProjectConfig } from "../types.js";
import { add } from "./add.js";

type InitOptions = {
  dir?: string;
  registry?: string;
  /** Framework target for materialized pages. */
  target?: string;
  /** Folder where generated pages are written. */
  pagesDir?: string;
  /** Folder where components live (the agent writes recipes here). */
  componentsDir?: string;
  /** How `component` materializes code: colocated CSS or Tailwind utilities. */
  styles?: string;
  /** Optionally bring a design system in right away (tokens + philosophy + rules). */
  ds?: string;
};

/**
 * Bootstraps a project for SynthesisUI: writes `_synthesisui/config.json`
 * (where `template` materializes pages, where components live, which framework to
 * target) and - with `--ds <slug>` - immediately brings that system in, so the
 * project lands with tokens, philosophy, rules and a CLAUDE.md in one step.
 * Committable; safe to re-run.
 */
export async function init(opts: InitOptions): Promise<void> {
  const root = opts.dir ?? process.cwd();
  const target: ProjectConfig["target"] =
    opts.target === "general" ? "general" : "next";
  const config: ProjectConfig = {
    target,
    pagesDir:
      opts.pagesDir ?? (target === "next" ? "app" : DEFAULT_CONFIG.pagesDir),
    componentsDir: opts.componentsDir ?? DEFAULT_CONFIG.componentsDir,
    styles: opts.styles === "tailwind" ? "tailwind" : "css",
  };
  await writeProjectConfig(root, config);

  console.log("✓ wrote _synthesisui/config.json");
  console.log(`  target:        ${config.target}`);
  console.log(`  pagesDir:      ${config.pagesDir}`);
  console.log(`  componentsDir: ${config.componentsDir}`);
  console.log(`  styles:        ${config.styles}`);

  // --ds bootstraps the project with a system in one step (tokens + philosophy
  // + rules + CLAUDE.md all arrive via `add`).
  if (opts.ds) {
    console.log("");
    await add(opts.ds, { registry: opts.registry, dir: root });
    return;
  }

  console.log("");
  console.log("Next steps:");
  console.log(
    "  • synthesisui add <slug>              bring a design system in",
  );
  console.log(
    "  • synthesisui template <slug> <name>  materialize a full page",
  );
}
