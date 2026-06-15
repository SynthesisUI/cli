import { resolveRegistry } from "../config.js";
import { fetchList } from "../registry.js";

type ListOptions = { registry?: string };

/** Lists the published design systems available in the registry. */
export async function list(opts: ListOptions): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const systems = await fetchList(base);

  if (systems.length === 0) {
    console.log(`No design systems published at ${base}.`);
    return;
  }

  console.log(`Available design systems (${base}):\n`);
  const width = Math.max(...systems.map((s) => s.slug.length));
  for (const s of systems) {
    console.log(`  ${s.slug.padEnd(width)}  ${s.name}  (v${s.version})`);
  }
  console.log(`\nBring one in with:  synthesisui add <slug>`);
}
