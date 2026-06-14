import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncClaudeMd } from "../claude-md.js";
import { resolveRegistry } from "../config.js";
import { buildGuide } from "../guide.js";
import { fetchDesignSystem } from "../registry.js";

type AddOptions = {
  registry?: string;
  /** Raiz do projeto consumidor (default: cwd). */
  dir?: string;
};

/**
 * Materializa um DS publicado em `_local/ds/<slug>/` e atualiza o CLAUDE.md.
 */
export async function add(slug: string, opts: AddOptions): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const projectRoot = opts.dir ?? process.cwd();

  console.log(`→ buscando "${slug}" em ${base} …`);
  const payload = await fetchDesignSystem(base, slug);

  const targetDir = join(projectRoot, "_local", "ds", payload.slug);
  await mkdir(targetDir, { recursive: true });

  // 1. artifacts compilados pelo servidor (tokens.css, e futuros theme.css…)
  for (const [filename, content] of Object.entries(payload.artifacts)) {
    await writeFile(join(targetDir, filename), content, "utf8");
  }

  // 2. verdade canônica
  await writeFile(
    join(targetDir, "design-system.json"),
    `${JSON.stringify(payload.document, null, 2)}\n`,
    "utf8",
  );

  // 3. guia para o agente (gerado client-side a partir do document)
  await writeFile(join(targetDir, "GUIDE.md"), buildGuide(payload), "utf8");

  // 4. lock reproduzível
  const lock = {
    slug: payload.slug,
    name: payload.name,
    version: payload.version,
    registry: base,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(
    join(targetDir, ".lock"),
    `${JSON.stringify(lock, null, 2)}\n`,
    "utf8",
  );

  // 5. descoberta pelo agente
  const claudeMd = await syncClaudeMd(projectRoot);

  const files = [
    ...Object.keys(payload.artifacts),
    "design-system.json",
    "GUIDE.md",
    ".lock",
  ];
  console.log(
    `✓ ${payload.name} v${payload.version} → _local/ds/${payload.slug}/`,
  );
  console.log(`  ${files.join(", ")}`);
  console.log(
    `  CLAUDE.md ${claudeMd.created ? "criado" : "atualizado"} (${claudeMd.count} sistema(s) instalado(s))`,
  );
  console.log("");
  console.log("Próximos passos:");
  console.log(
    `  • @import "_local/ds/${payload.slug}/tokens.css" no seu CSS global`,
  );
  console.log(`  • escope sua UI com data-ds="${payload.slug}"`);
  console.log(`  • detalhes e regras em _local/ds/${payload.slug}/GUIDE.md`);
}
