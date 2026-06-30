import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRegistry } from "../config.js";
import { fetchComponent } from "../registry.js";

type ComponentOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Specific DS version (latest when omitted). */
  version?: number;
};

/**
 * Brings ONE component from a design system into the project (granular "bring
 * specific", INS-18 fatia 3) - its recipe + compiled CSS, written under
 * `_synthesisui/ds/<slug>/components/`. Handy for a component you refit/created
 * on the platform. The component's styles reference the DS tokens, so the system
 * itself must be installed (`synthesisui add <slug>`) for `tokens.css` to resolve.
 */
export async function component(
  slug: string,
  name: string,
  opts: ComponentOptions,
): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const root = opts.dir ?? process.cwd();

  console.log(`→ fetching "${name}" from "${slug}" …`);
  const res = await fetchComponent(base, slug, name, opts.version);

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
  console.log("");
  console.log("Use it:");
  console.log(
    `  • ensure the DS is installed: synthesisui add ${slug} (provides tokens.css)`,
  );
  console.log(
    `  • @import "_synthesisui/ds/${slug}/components/${res.name}.css" in your CSS`,
  );
  console.log(
    `  • <div data-ds="${slug}"><div class="ds-${res.name}">…</div></div>`,
  );
}
