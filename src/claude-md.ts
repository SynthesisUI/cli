import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const START = "<!-- synthesisui:start -->";
const END = "<!-- synthesisui:end -->";

type InstalledLock = {
  slug: string;
  name: string;
  version: number;
};

/** Lê os DSs instalados a partir dos .lock em _synthesisui/ds/<slug>/. */
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
      // pasta sem .lock válido — ignora
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
        `- **${ds.name}** (\`${ds.slug}\`, v${ds.version}) — guia: \`_synthesisui/ds/${ds.slug}/GUIDE.md\``,
    )
    .join("\n");

  const body = `## Design Systems (via SynthesisUI)

Este projeto usa design system(s) trazido(s) pelo \`synthesisui\` CLI. **Ao criar ou editar
componentes, leia o GUIDE.md do sistema e siga-o:** use apenas tokens semânticos
(\`var(--ds-color-semantic-*)\`, \`--ds-spacing-*\`, etc.), escope a UI com \`data-ds="<slug>"\`,
e reaproveite as classes \`.ds-*\`. Não use valores crus fora da escala do sistema.

${lines}

_Bloco gerenciado pelo CLI — não edite à mão; rode \`synthesisui add <slug>\` para atualizar._`;

  return `${START}\n${body}\n${END}`;
}

/**
 * Regenera o bloco gerenciado no CLAUDE.md da raiz refletindo todos os DSs
 * instalados. Idempotente: substitui o trecho entre os marcadores se existir,
 * senão cria o arquivo / anexa o bloco. Retorna se o arquivo foi criado.
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
