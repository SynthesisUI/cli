import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Monta um resumo COMPACTO e aterrado do projeto pro advisor - barato em tokens
 * e suficiente pra propostas específicas: stack (package.json), forma do repo
 * (árvore nível 1), DS SynthesisUI instalado(s) e o começo do README. Sem dump
 * de código (custo/ruído): o advisor propõe padrões, não lê implementação.
 */

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nx",
  ".turbo",
  ".cache",
  ".vercel",
]);
const MAX_README_LINES = 40;
const MAX_DEPS = 40;

async function readJson<T = Record<string, unknown>>(
  path: string,
): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function topLevelTree(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith(".") && !SKIP_DIRS.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
  } catch {
    return [];
  }
}

async function installedDesignSystems(root: string): Promise<string[]> {
  const dsRoot = join(root, "_synthesisui", "ds");
  const out: string[] = [];
  try {
    for (const e of await readdir(dsRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const lock = await readJson<{ name?: string; version?: number }>(
        join(dsRoot, e.name, ".lock"),
      );
      out.push(`${lock?.name ?? e.name} (v${lock?.version ?? "?"})`);
    }
  } catch {
    // nenhum DS instalado - tudo bem
  }
  return out;
}

async function readmeHead(root: string): Promise<string | null> {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    try {
      const txt = await readFile(join(root, name), "utf8");
      return txt.split("\n").slice(0, MAX_README_LINES).join("\n").trim();
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

export async function buildRepoContext(root: string): Promise<string> {
  const pkg = await readJson<{
    name?: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(join(root, "package.json"));

  const parts: string[] = [];

  if (pkg) {
    parts.push(
      `Projeto: ${pkg.name ?? "(sem nome)"}${
        pkg.description ? ` - ${pkg.description}` : ""
      }`,
    );
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ].slice(0, MAX_DEPS);
    if (deps.length) parts.push(`Dependências: ${deps.join(", ")}`);
    const scripts = Object.keys(pkg.scripts ?? {});
    if (scripts.length) parts.push(`Scripts: ${scripts.join(", ")}`);
  }

  const tree = await topLevelTree(root);
  if (tree.length) parts.push(`Estrutura (nível 1): ${tree.join(", ")}`);

  const ds = await installedDesignSystems(root);
  if (ds.length)
    parts.push(`Design systems SynthesisUI instalados: ${ds.join(", ")}`);

  const rd = await readmeHead(root);
  if (rd) parts.push(`README (início):\n${rd}`);

  return parts.join("\n\n");
}
