import { resolveRegistry } from "../config.js";
import { fetchList } from "../registry.js";

type ListOptions = { registry?: string };

/** Lista os design systems publicados disponíveis no registry. */
export async function list(opts: ListOptions): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const systems = await fetchList(base);

  if (systems.length === 0) {
    console.log(`Nenhum design system publicado em ${base}.`);
    return;
  }

  console.log(`Design systems disponíveis (${base}):\n`);
  const width = Math.max(...systems.map((s) => s.slug.length));
  for (const s of systems) {
    console.log(`  ${s.slug.padEnd(width)}  ${s.name}  (v${s.version})`);
  }
  console.log(`\nTraga um com:  synthesisui add <slug>`);
}
