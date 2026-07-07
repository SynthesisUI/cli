import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const START = "<!-- synthesisui:start -->";
const END = "<!-- synthesisui:end -->";

type InstalledLock = {
  slug: string;
  name: string;
  version: number;
};

/** Reads the installed DSs from the .lock files in _synthesisui/ds/<slug>/. */
async function readInstalled(projectRoot: string): Promise<InstalledLock[]> {
  const dsDir = join(projectRoot, "_synthesisui", "ds");
  let entries: string[] = [];
  try {
    const dirents = await readdir(dsDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }

  const locks: InstalledLock[] = [];
  for (const slug of entries.sort()) {
    try {
      const raw = await readFile(join(dsDir, slug, ".lock"), "utf8");
      const lock = JSON.parse(raw) as InstalledLock;
      locks.push({ slug: lock.slug, name: lock.name, version: lock.version });
    } catch {
      // folder without a valid .lock - ignore
    }
  }
  return locks;
}

type CatalogEntry = { name: string; line: string };

/** First sentence of a description, capped - the manifest must stay lean. */
function summarize(desc: unknown): string {
  if (typeof desc !== "string" || !desc.trim()) return "";
  const first = desc.trim().split(/(?<=\.)\s/)[0] ?? desc.trim();
  return first.length > 90 ? `${first.slice(0, 87)}…` : first;
}

/** One manifest line per recipe: name, what it is, and its variant axes. */
function catalogLines(recipes: Record<string, unknown>): CatalogEntry[] {
  return Object.entries(recipes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, recipe]) => {
      const r = recipe as {
        description?: unknown;
        variants?: Record<string, Record<string, unknown>>;
      };
      const axes = Object.entries(r.variants ?? {})
        .map(([axis, options]) => {
          const keys = Object.keys(options);
          return keys.length <= 4 ? `${axis}: ${keys.join("|")}` : axis;
        })
        .join("; ");
      const desc = summarize(r.description);
      return {
        name,
        line: `  - \`ds-${name}\`${desc ? ` - ${desc}` : ""}${axes ? ` [${axes}]` : ""}`,
      };
    });
}

/**
 * The COMPONENT MANIFEST for one installed system, read from its versioned
 * design-system.json. This is what lets the app's agent know what it already
 * HAS - "use these before creating new ones" - instead of re-inventing
 * buttons. Returns null when the document isn't readable (older installs).
 */
async function readManifest(
  projectRoot: string,
  ds: InstalledLock,
): Promise<string | null> {
  try {
    const raw = await readFile(
      join(
        projectRoot,
        "_synthesisui",
        "ds",
        ds.slug,
        `v${ds.version}`,
        "design-system.json",
      ),
      "utf8",
    );
    const doc = JSON.parse(raw) as {
      components?: Record<string, unknown>;
      blocks?: Record<string, unknown>;
    };
    const components = catalogLines(doc.components ?? {});
    const blocks = catalogLines(doc.blocks ?? {});
    if (components.length === 0 && blocks.length === 0) return null;
    const lines: string[] = [];
    if (components.length > 0) {
      lines.push(
        `  Components (${components.length}) - USE these before creating new ones:`,
      );
      lines.push(...components.map((c) => c.line));
    }
    if (blocks.length > 0) {
      lines.push(`  Engagement blocks (${blocks.length}):`);
      lines.push(...blocks.map((c) => c.line));
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}

async function renderRegion(
  projectRoot: string,
  installed: InstalledLock[],
): Promise<string> {
  if (installed.length === 0) {
    return `${START}\n${END}`;
  }
  const sections: string[] = [];
  for (const ds of installed) {
    const head = `- **${ds.name}** (\`${ds.slug}\`, v${ds.version}) - guide: \`_synthesisui/ds/${ds.slug}/v${ds.version}/GUIDE.md\``;
    const manifest = await readManifest(projectRoot, ds);
    sections.push(manifest ? `${head}\n${manifest}` : head);
  }

  const body = `## Design Systems (via SynthesisUI)

This project uses design system(s) brought in by the \`synthesisui\` CLI. **When creating or editing
components, read the system's GUIDE.md and follow it:** use only semantic tokens
(\`var(--ds-color-semantic-*)\`, \`--ds-spacing-*\`, etc.), scope the UI with \`data-ds="<slug>"\`,
and reuse the \`.ds-*\` classes. Do not use raw values outside the system's scale. **Before
creating any UI element, check the component manifest below - if it exists, use or extend
it (\`synthesisui component <slug> <name>\` materializes it as your code).** To review a
component, create an isolated sample page (e.g. \`app/synthesisui-samples/<component>/\`) - do not
apply it to real production pages unless asked.

${sections.join("\n")}

_Block managed by the CLI - do not edit by hand; run \`synthesisui add <slug>\` to update._`;

  return `${START}\n${body}\n${END}`;
}

/**
 * Regenerates the managed block in the root CLAUDE.md reflecting every installed
 * DS. Idempotent: replaces the text between the markers if present, otherwise
 * creates the file / appends the block. Returns whether the file was created.
 */
export async function syncClaudeMd(projectRoot: string): Promise<{
  created: boolean;
  count: number;
}> {
  const installed = await readInstalled(projectRoot);
  const region = await renderRegion(projectRoot, installed);
  const path = join(projectRoot, "CLAUDE.md");

  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf8");
  } catch {
    existing = null;
  }

  if (existing === null) {
    await writeFile(path, `${region}\n`, "utf8");
    return { created: true, count: installed.length };
  }

  const startIdx = existing.indexOf(START);
  const endIdx = existing.indexOf(END);
  let next: string;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    next =
      existing.slice(0, startIdx) +
      region +
      existing.slice(endIdx + END.length);
  } else {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    next = `${existing}${sep}${region}\n`;
  }
  await writeFile(path, next, "utf8");
  return { created: false, count: installed.length };
}
