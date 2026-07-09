import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateComponentFiles } from "../component-codegen.js";
import { readProjectConfig, resolveRegistry } from "../config.js";
import { postGenerate, RegistryError } from "../registry.js";

/** PascalCase para o hint de import (course-card → CourseCard). */
function pascalName(name: string): string {
  return name.replace(/(^|[-_])([a-z0-9])/g, (_, __, c: string) =>
    c.toUpperCase(),
  );
}

/** Versão ativa do DS instalado (do `.lock`); 1 se ausente - só nomeia o header. */
async function readActiveVersion(root: string, slug: string): Promise<number> {
  try {
    const raw = await readFile(
      join(root, "_synthesisui", "ds", slug, ".lock"),
      "utf8",
    );
    const lock = JSON.parse(raw) as { version?: number };
    return typeof lock.version === "number" ? lock.version : 1;
  } catch {
    return 1;
  }
}

type GenerateOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Target DS slug (default: the one installed under _synthesisui/ds/). */
  ds?: string;
  /** Preferred component name. */
  name?: string;
};

/** Slugs materialized under `_synthesisui/ds/` in the project. */
async function installedSlugs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, "_synthesisui", "ds"), {
      withFileTypes: true,
    });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Generates a token-only component recipe for the project's design system
 * (chat-gen PRO, hosted) and materializes it additively under
 * `_synthesisui/ds/<slug>/generated/`. The recipe wears the DS by construction;
 * the prompt lives server-side. Nothing else in the project is touched.
 */
export async function generate(
  description: string,
  opts: GenerateOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  let slug = opts.ds;
  if (!slug) {
    const slugs = await installedSlugs(root);
    if (slugs.length === 1) {
      slug = slugs[0];
    } else if (slugs.length === 0) {
      throw new RegistryError(
        "No design system installed here. Run `synthesisui add <slug>` first, or pass --ds <slug>.",
      );
    } else {
      throw new RegistryError(
        `Multiple design systems installed (${slugs.join(", ")}). Pick one with --ds <slug>.`,
      );
    }
  }

  console.log(`→ generating a component for "${slug}" at ${base} …`);
  const res = await postGenerate(base, { slug, description, name: opts.name });

  const dir = join(root, "_synthesisui", "ds", slug, "generated");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${res.name}.json`),
    `${JSON.stringify(res.recipe, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(dir, `${res.name}.css`), `${res.css}\n`, "utf8");

  const tries = `${res.tries} ${res.tries === 1 ? "try" : "tries"}`;
  console.log(`✓ ${res.name} generated (${res.model}, ${tries})`);
  console.log(`  → _synthesisui/ds/${slug}/generated/${res.name}.{json,css}`);

  // Materialize YOUR component (.tsx) too - the SAME codegen `component` uses -
  // so a generated component is as usable as a brought-in one, not just a
  // recipe you have to wire by hand.
  const config = await readProjectConfig(root);
  let materialized = false;
  if (config.target === "next") {
    const version = await readActiveVersion(root, slug);
    const compDir = join(root, config.componentsDir, res.name);
    await mkdir(compDir, { recursive: true });
    const files = generateComponentFiles(
      slug,
      res.name,
      res.recipe,
      res.css,
      version,
      config.styles,
    );
    for (const file of files) {
      await writeFile(join(compDir, file.filename), file.code, "utf8");
    }
    materialized = true;
    console.log(
      `✓ ${config.componentsDir}/${res.name}/ → ${files.map((f) => f.filename).join(", ")}  (styles: ${config.styles})`,
    );
  }

  console.log("");
  console.log("Use it:");
  if (materialized) {
    const comp = pascalName(res.name);
    console.log(
      `  • import { ${comp} } from "@/${config.componentsDir}/${res.name}";`,
    );
    console.log(
      `  • <${comp} /> - compose its parts + content (see the recipe)`,
    );
  } else {
    console.log(
      `  • @import "_synthesisui/ds/${slug}/generated/${res.name}.css" in your CSS`,
    );
    console.log(
      `  • <div data-ds="${slug}"><div class="ds-${res.name}">…</div></div>`,
    );
  }
  console.log(
    `  (${res.usage.inputTokens} in / ${res.usage.outputTokens} out tokens · AI action - additive; nothing else changed)`,
  );
}
