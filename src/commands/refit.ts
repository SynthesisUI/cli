import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { generateComponentFiles } from "../component-codegen.js";
import { readProjectConfig, resolveRegistry } from "../config.js";
import { body, section, snippet } from "../output.js";
import {
  fetchComponent,
  postRefit,
  postSaveComponent,
  RegistryError,
} from "../registry.js";

type RefitOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Target personal DS slug (default: the single one installed). */
  ds?: string;
  /** Preferred kebab-case name (default: the AI derives one from the code). */
  name?: string;
  /** Replace an EXISTING component of the DS instead of adding a new one. */
  replace?: string;
  /** Extra guidance for the adaptation. */
  instruction?: string;
  /** Path to supporting CSS (globals/vars the component references). */
  support?: string;
  /** Adapt and show the result, but save nothing (no DS write, no files). */
  dry?: boolean;
};

/** Slugs INSTALLED under `_synthesisui/ds/` (a `.lock` marks a real install -
 *  a folder holding only refit artifacts doesn't count). */
async function installedSlugs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, "_synthesisui", "ds"), {
      withFileTypes: true,
    });
    const slugs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await access(join(root, "_synthesisui", "ds", entry.name, ".lock"));
        slugs.push(entry.name);
      } catch {
        // artifacts-only folder (e.g. a refit before `add`) - not installed
      }
    }
    return slugs;
  } catch {
    return [];
  }
}

/** True when the system is actually installed (tokens.css present). */
async function isInstalled(root: string, slug: string): Promise<boolean> {
  try {
    await access(join(root, "_synthesisui", "ds", slug, ".lock"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Marco B5 - the REVERSE bridge, from the CLI: takes a component that lives in
 * YOUR app (arbitrary React/CSS), re-expresses it in the design system's
 * token vocabulary (hosted refit - gated + metered), SAVES it into your
 * personal DS draft (it ships with the next `publish`), and materializes it
 * back into componentsDir as your typed component. One command closes the
 * loop: app code → on-system recipe → back as code.
 */
export async function refit(file: string, opts: RefitOptions): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  // 1. the source component (the server caps at 24k chars - fail fast here)
  let source: string;
  try {
    source = await readFile(join(root, file), "utf8");
  } catch {
    throw new RegistryError(`Could not read "${file}".`);
  }
  if (source.trim().length === 0) {
    throw new RegistryError(`"${file}" is empty.`);
  }
  if (source.length > 24_000) {
    throw new RegistryError(
      `"${file}" is ${source.length} chars - the refit cap is 24k. Trim it to the component itself.`,
    );
  }
  let support: string | undefined;
  if (opts.support) {
    try {
      support = await readFile(join(root, opts.support), "utf8");
    } catch {
      throw new RegistryError(`Could not read support file "${opts.support}".`);
    }
  }

  // 2. target DS (same inference as `generate`: the single installed one)
  let slug = opts.ds;
  if (!slug) {
    const slugs = await installedSlugs(root);
    if (slugs.length === 1) slug = slugs[0];
    else if (slugs.length === 0)
      throw new RegistryError(
        "No design system installed here. Run `synthesisui add <slug>` first, or pass --ds <slug>.",
      );
    else
      throw new RegistryError(
        `Multiple design systems installed (${slugs.join(", ")}). Pick one with --ds <slug>.`,
      );
  }

  // 3. replace mode: fetch the existing recipe so the server keeps its name
  //    (deterministic - the AI is not trusted with it)
  let prior: { name: string; recipe: unknown } | undefined;
  if (opts.replace) {
    const existing = await fetchComponent(base, slug, opts.replace);
    prior = { name: existing.name, recipe: existing.recipe };
  }

  console.log(
    `→ refitting ${basename(file)} into "${slug}"${prior ? ` (replacing ds-${prior.name})` : ""} …`,
  );
  const instruction = [
    opts.instruction,
    !prior && opts.name ? `Name it "${opts.name}".` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const res = await postRefit(base, {
    slug,
    source,
    support,
    instruction: instruction || undefined,
    prior,
  });

  const tries = `${res.tries} ${res.tries === 1 ? "try" : "tries"}`;
  console.log(`✓ adapted as ds-${res.name} (${res.model}, ${tries})`);

  if (opts.dry) {
    console.log(section("Dry run - nothing saved"));
    console.log(body("The recipe it would save:"));
    console.log("");
    console.log(snippet(JSON.stringify(res.recipe, null, 2).split("\n")));
    console.log("");
    return;
  }

  // 4. save into the personal DS draft (server re-validates token-only)
  const saved = await postSaveComponent(base, {
    slug,
    name: res.name,
    recipe: res.recipe,
  });
  console.log(
    `✓ saved into "${slug}" (draft v${saved.version} - ships with your next publish)`,
  );

  // 5. materialize back into the project: artifacts + YOUR typed component
  const artifactsDir = join(root, "_synthesisui", "ds", slug, "components");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    join(artifactsDir, `${res.name}.json`),
    `${JSON.stringify(res.recipe, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(artifactsDir, `${res.name}.css`),
    `${res.css}\n`,
    "utf8",
  );

  const config = await readProjectConfig(root);
  let materialized = false;
  if (config.target === "next") {
    const compDir = join(root, config.componentsDir, res.name);
    await mkdir(compDir, { recursive: true });
    const files = generateComponentFiles(
      slug,
      res.name,
      res.recipe,
      res.css,
      saved.version,
      config.styles,
    );
    for (const f of files) {
      await writeFile(join(compDir, f.filename), f.code, "utf8");
    }
    materialized = true;
    console.log(
      `✓ ${config.componentsDir}/${res.name}/ → ${files.map((f) => f.filename).join(", ")}  (styles: ${config.styles})`,
    );
  }

  // The materialized component references this system's tokens - without the
  // install (tokens.css + scope) it renders unstyled. Say so, concretely.
  if (!(await isInstalled(root, slug))) {
    console.log(section("Heads up - system not installed here yet"));
    console.log(
      body(
        `The component references "${slug}" tokens that this project doesn't have yet.`,
      ),
    );
    console.log("");
    console.log(snippet([`npx synthesisui add ${slug}`]));
    console.log("");
    console.log(
      body("(then follow its one-time setup: global @import + data-ds scope)"),
    );
  }

  if (res.suggestedRule) {
    console.log(section("Suggested rule"));
    console.log(body("The AI inferred a reusable rule from this component:"));
    console.log("");
    console.log(snippet([`"${res.suggestedRule}"`]));
    console.log("");
    console.log(
      body(
        `(save it in the studio if it holds: /dashboard/mine/${slug}/studio)`,
      ),
    );
  }

  console.log(section("Done - the loop is closed"));
  console.log(
    body(
      `Your component now lives in the design system (docs, studio, showcase)`,
    ),
  );
  if (materialized) {
    const pascal = res.name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join("");
    console.log(body(`and back in your code, on-system:`));
    console.log("");
    console.log(
      snippet([
        `import { ${pascal} } from "@/${config.componentsDir}/${res.name}";`,
      ]),
    );
    console.log("");
    console.log(
      body(
        `(replace the old ${basename(file)} usages with it when you're ready)`,
      ),
    );
  }
  console.log("");
}
