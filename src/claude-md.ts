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
      // folder without a valid .lock — ignore
    }
  }
  return locks;
}

function renderRegion(installed: InstalledLock[]): string {
  if (installed.length === 0) {
    return `${START}\n${END}`;
  }
  const lines = installed
    .map(
      (ds) =>
        `- **${ds.name}** (\`${ds.slug}\`, v${ds.version}) — guide: \`_synthesisui/ds/${ds.slug}/v${ds.version}/GUIDE.md\``,
    )
    .join("\n");

  const body = `## Design Systems (via SynthesisUI)

This project uses design system(s) brought in by the \`synthesisui\` CLI. **When creating or editing
components, read the system's GUIDE.md and follow it:** use only semantic tokens
(\`var(--ds-color-semantic-*)\`, \`--ds-spacing-*\`, etc.), scope the UI with \`data-ds="<slug>"\`,
and reuse the \`.ds-*\` classes. Do not use raw values outside the system's scale. **To review a
component, create an isolated sample page (e.g. \`app/synthesisui-samples/<component>/\`) — do not
apply it to real production pages unless asked.**

${lines}

_Block managed by the CLI — do not edit by hand; run \`synthesisui add <slug>\` to update._`;

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
  const region = renderRegion(installed);
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
