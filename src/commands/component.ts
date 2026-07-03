import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateComponentFiles } from "../component-codegen.js";
import { readProjectConfig, resolveRegistry } from "../config.js";
import { body, section, snippet } from "../output.js";
import { fetchComponent, RegistryError } from "../registry.js";

/** Slugs/names are kebab-case by contract; reject anything else before it ever
 *  reaches a filesystem path (defense-in-depth against `../` traversal). */
const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ComponentOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Specific DS version (latest when omitted). */
  version?: number;
  /** Skip the code materialization (write only recipe + css artifacts). */
  artifactsOnly?: boolean;
};

/**
 * Brings ONE component from a design system into the project (granular "bring
 * specific", INS-18 fatia 3):
 *
 * 1. Artifacts (source of truth) → `_synthesisui/ds/<slug>/components/`:
 *    the recipe (.json, for agents/tooling) + compiled CSS (.css).
 * 2. YOUR component (unless --artifacts-only, target "next") →
 *    `<componentsDir>/<name>/` from `_synthesisui/config.json`: a real
 *    `export function <Pascal>()` with variants as typed props, in the
 *    project's chosen flavor (`styles: "css" | "tailwind"`).
 *
 * The component's styles reference the DS tokens, so the system itself must be
 * installed (`synthesisui add <slug>`) for `tokens.css`/`theme.css` to resolve.
 */
export async function component(
  slug: string,
  name: string,
  opts: ComponentOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  if (!SAFE_NAME.test(slug)) {
    throw new RegistryError(`Invalid slug "${slug}".`);
  }

  console.log(`→ fetching "${name}" from "${slug}" …`);
  const res = await fetchComponent(base, slug, name, opts.version);

  // The server should only ever return a kebab-case name, but never trust a
  // network value as a path segment.
  if (!SAFE_NAME.test(res.name)) {
    throw new RegistryError(`Registry returned an unsafe component name.`);
  }

  const dir = join(root, "_synthesisui", "ds", slug, "components");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${res.name}.json`),
    `${JSON.stringify(res.recipe, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(dir, `${res.name}.css`), `${res.css}\n`, "utf8");

  console.log(
    `✓ ${res.name} → _synthesisui/ds/${slug}/components/${res.name}.{json,css}  (${slug} v${res.version})`,
  );

  // 2. YOUR component - a real, importable `export function <Pascal>()` in the
  //    project's flavor (config: styles css|tailwind), under componentsDir.
  const config = await readProjectConfig(root);
  if (!opts.artifactsOnly && config.target === "next") {
    const compDir = join(root, config.componentsDir, res.name);
    await mkdir(compDir, { recursive: true });
    const files = generateComponentFiles(
      slug,
      res.name,
      res.recipe,
      res.css,
      res.version,
      config.styles,
    );
    for (const file of files) {
      await writeFile(join(compDir, file.filename), file.code, "utf8");
    }
    const names = files.map((f) => f.filename).join(", ");
    console.log(
      `✓ ${config.componentsDir}/${res.name}/ → ${names}  (styles: ${config.styles})`,
    );
  }

  // ── DX: concrete paths + copy-pasteable snippets, with breathing room ──
  const tailwind = config.styles === "tailwind";
  const imports = tailwind
    ? [
        `@import "tailwindcss";`,
        `@import "../_synthesisui/ds/${slug}/tokens.css";`,
        `@import "../_synthesisui/ds/${slug}/theme.css";`,
      ]
    : [`@import "../_synthesisui/ds/${slug}/tokens.css";`];

  console.log(section(`One-time setup (once per app, for "${slug}")`));
  console.log(
    body(
      `1. Import the design system in your GLOBAL stylesheet, e.g. app/globals.css`,
    ),
  );
  console.log(
    body(`   (the path is relative to that file - hence the leading ../):`),
  );
  console.log("");
  console.log(snippet(imports));
  console.log("");
  console.log(
    body(
      `2. Scope your app: add data-ds="${slug}" to a ROOT element, e.g. app/layout.tsx:`,
    ),
  );
  console.log("");
  console.log(snippet([`<body data-ds="${slug}">{children}</body>`]));
  console.log("");
  console.log(
    body(
      `(If you haven't installed the system yet, run: synthesisui add ${slug})`,
    ),
  );

  console.log(section("Use it"));
  if (!opts.artifactsOnly && config.target === "next") {
    const pascalName = res.name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join("");
    // Show a real variant in the example when the recipe has one.
    const firstAxis = Object.entries(res.recipe.variants ?? {}).find(
      ([, options]) =>
        Object.values(options).some((block) => Object.keys(block).length > 0),
    );
    const exampleProp = firstAxis
      ? ` ${firstAxis[0]}="${Object.keys(firstAxis[1])[0]}"`
      : "";
    console.log(
      snippet([
        `import { ${pascalName} } from "@/${config.componentsDir}/${res.name}";`,
        "",
        `<${pascalName}${exampleProp} />`,
      ]),
    );
    console.log("");
    console.log(
      body(`(adjust "@/" to your project's import alias if it differs)`),
    );
    console.log("");
    console.log(body("Or ask your agent:"));
    console.log(
      snippet([
        `"Use the ${pascalName} component from ${config.componentsDir}/${res.name} (SynthesisUI ${slug})."`,
      ]),
    );
  } else {
    console.log(
      snippet([
        `@import "../_synthesisui/ds/${slug}/components/${res.name}.css";`,
        "",
        `<div class="ds-${res.name}">…</div>`,
      ]),
    );
  }
  console.log("");
}
