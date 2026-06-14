import { readToken } from "./config.js";
import type { RegistryPayload, RegistrySummary } from "./types.js";

export class RegistryError extends Error {}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: await authHeaders() });
  } catch {
    throw new RegistryError(
      `Não consegui falar com o registry em ${url}. ` +
        `Confira a URL (--registry / SYNTHESISUI_REGISTRY_URL) e a conexão.`,
    );
  }
  return res;
}

/** Lista os design systems publicados disponíveis. */
export async function fetchList(base: string): Promise<RegistrySummary[]> {
  const res = await request(`${base}/api/registry/ds`);
  if (!res.ok) {
    throw new RegistryError(`Registry respondeu ${res.status} ao listar.`);
  }
  const body = (await res.json()) as { designSystems: RegistrySummary[] };
  return body.designSystems ?? [];
}

/** Busca um DS publicado já compilado (document + artifacts). */
export async function fetchDesignSystem(
  base: string,
  slug: string,
): Promise<RegistryPayload> {
  const res = await request(
    `${base}/api/registry/ds/${encodeURIComponent(slug)}`,
  );
  if (res.status === 404) {
    throw new RegistryError(
      `Nenhum design system publicado com slug "${slug}". ` +
        `Rode \`synthesisui list\` para ver os disponíveis.`,
    );
  }
  if (!res.ok) {
    throw new RegistryError(
      `Registry respondeu ${res.status} ao buscar "${slug}".`,
    );
  }
  return (await res.json()) as RegistryPayload;
}
