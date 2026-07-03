import { readToken } from "./config.js";
import type {
  AdvisorResponse,
  ChangelogResponse,
  FetchedComponent,
  GeneratedPage,
  GenerateResponse,
  RegistryPayload,
  RegistrySummary,
} from "./types.js";

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
      `Could not reach the registry at ${url}. ` +
        `Check the URL (--registry / SYNTHESISUI_REGISTRY_URL) and your connection.`,
    );
  }
  return res;
}

/** Lists the available published design systems. */
export async function fetchList(base: string): Promise<RegistrySummary[]> {
  const res = await request(`${base}/api/registry/ds`);
  if (!res.ok) {
    throw new RegistryError(`Registry responded ${res.status} while listing.`);
  }
  const body = (await res.json()) as { designSystems: RegistrySummary[] };
  return body.designSystems ?? [];
}

/**
 * Fetches a published DS already compiled (document + artifacts). Without
 * `version` it returns the latest; with `version` it returns that one.
 */
export async function fetchDesignSystem(
  base: string,
  slug: string,
  version?: number,
): Promise<RegistryPayload> {
  const url = new URL(`${base}/api/registry/ds/${encodeURIComponent(slug)}`);
  if (version != null) url.searchParams.set("version", String(version));

  const res = await request(url.toString());
  if (res.status === 404) {
    throw new RegistryError(
      `No design system published with slug "${slug}"${
        version != null ? ` at version v${version}` : ""
      }. Run \`synthesisui list\` to see what's available.`,
    );
  }
  if (!res.ok) {
    throw new RegistryError(
      `Registry responded ${res.status} while fetching "${slug}".`,
    );
  }
  return (await res.json()) as RegistryPayload;
}

/**
 * Fetches a whole page generated from a DS template (`?template=&target=`). The
 * server codegens it from `document.layouts[<template>]`; the CLI just writes it.
 */
export async function fetchTemplate(
  base: string,
  slug: string,
  template: string,
  target: "next" | "general",
  version?: number,
): Promise<GeneratedPage> {
  const url = new URL(`${base}/api/registry/ds/${encodeURIComponent(slug)}`);
  url.searchParams.set("template", template);
  url.searchParams.set("target", target);
  if (version != null) url.searchParams.set("version", String(version));

  const res = await request(url.toString());
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(
      body.message ??
        `No template "${template}" in "${slug}". Run \`synthesisui list\` and check the DS templates.`,
    );
  }
  if (!res.ok) {
    throw new RegistryError(
      `Registry responded ${res.status} while generating "${template}".`,
    );
  }
  return (await res.json()) as GeneratedPage;
}

/**
 * Fetches ONE component from a DS (`?component=<name>`): its recipe + compiled
 * CSS. Granular "bring specific" - the system must exist; works for public DS
 * without login (private/owned needs the token).
 */
export async function fetchComponent(
  base: string,
  slug: string,
  name: string,
  version?: number,
): Promise<FetchedComponent> {
  const url = new URL(`${base}/api/registry/ds/${encodeURIComponent(slug)}`);
  url.searchParams.set("component", name);
  if (version != null) url.searchParams.set("version", String(version));

  const res = await request(url.toString());
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(
      body.message ??
        `No component "${name}" in "${slug}". Run \`synthesisui add ${slug}\` and check its components.`,
    );
  }
  if (!res.ok) {
    throw new RegistryError(
      `Registry responded ${res.status} while fetching "${name}".`,
    );
  }
  return (await res.json()) as FetchedComponent;
}

/**
 * Calls the hosted advisor (`POST /api/ai/advisor`). Gated + metered server-side:
 * 401 = not logged in, 429 = daily quota reached. Sends the Bearer token if present.
 */
export async function postAdvisor(
  base: string,
  context: string,
): Promise<AdvisorResponse> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/ai/advisor`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ context }),
    });
  } catch {
    throw new RegistryError(
      `Could not reach the registry at ${base}. ` +
        `Check the URL (--registry / SYNTHESISUI_REGISTRY_URL) and your connection.`,
    );
  }

  if (res.status === 401) {
    throw new RegistryError(
      "Not authenticated. Run `synthesisui login` first.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(body.message ?? `Advisor responded ${res.status}.`);
  }
  return (await res.json()) as AdvisorResponse;
}

/**
 * Gera uma recipe token-only (chat-gen PRO) via `POST /api/ai/generate`.
 * Gated + metered server-side: 401 = sem login, 429 = cota diária estourada.
 */
export async function postGenerate(
  base: string,
  payload: { slug: string; description: string; name?: string },
): Promise<GenerateResponse> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/ai/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new RegistryError(
      `Could not reach the registry at ${base}. ` +
        `Check the URL (--registry / SYNTHESISUI_REGISTRY_URL) and your connection.`,
    );
  }

  if (res.status === 401) {
    throw new RegistryError(
      "Not authenticated. Run `synthesisui login` first.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(
      body.message ?? `Generate responded ${res.status}.`,
    );
  }
  return (await res.json()) as GenerateResponse;
}

/** Changelog determinístico entre duas versões (Marco B) - `?changelog&from=N`. */
export async function fetchChangelog(
  base: string,
  slug: string,
  from: number,
  to?: number,
): Promise<ChangelogResponse> {
  const url = new URL(`${base}/api/registry/ds/${encodeURIComponent(slug)}`);
  url.searchParams.set("changelog", "");
  url.searchParams.set("from", String(from));
  if (to != null) url.searchParams.set("to", String(to));

  const res = await request(url.toString());
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(
      body.message ?? `Registry responded ${res.status} for the changelog.`,
    );
  }
  return (await res.json()) as ChangelogResponse;
}

/** Resposta do refit hospedado (`POST /api/ai/studio` com `source`). */
export type RefitResponse = {
  name: string;
  recipe: import("./types.js").ComponentRecipe;
  css: string;
  suggestedRule?: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  tries: number;
};

/**
 * Refit hospedado (INS-18 / Marco B5): manda código de componente arbitrário e
 * recebe a recipe token-only vestida no DS. Gated + metered server-side:
 * 401 = sem login, 429 = cota diária.
 */
export async function postRefit(
  base: string,
  payload: {
    slug: string;
    source: string;
    support?: string;
    instruction?: string;
    prior?: { name: string; recipe: unknown };
  },
): Promise<RefitResponse> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/ai/studio`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new RegistryError(
      `Could not reach the registry at ${base}. ` +
        `Check the URL (--registry / SYNTHESISUI_REGISTRY_URL) and your connection.`,
    );
  }
  if (res.status === 401) {
    throw new RegistryError(
      "Not authenticated. Run `synthesisui login` first.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(body.message ?? `Refit responded ${res.status}.`);
  }
  return (await res.json()) as RefitResponse;
}

/**
 * Persiste um componente no DS pessoal do usuário autenticado
 * (`POST /api/ds/component`) - a metade "salvar" da ponte reversa. O servidor
 * re-valida a recipe (token-only, sem refs órfãs) antes de gravar no rascunho.
 */
export async function postSaveComponent(
  base: string,
  payload: { slug: string; name: string; recipe: unknown },
): Promise<{ slug: string; name: string; version: number }> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/ds/component`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new RegistryError(
      `Could not reach the registry at ${base}. ` +
        `Check the URL (--registry / SYNTHESISUI_REGISTRY_URL) and your connection.`,
    );
  }
  if (res.status === 401) {
    throw new RegistryError(
      "Not authenticated. Run `synthesisui login` first.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RegistryError(body.message ?? `Save responded ${res.status}.`);
  }
  return (await res.json()) as { slug: string; name: string; version: number };
}
