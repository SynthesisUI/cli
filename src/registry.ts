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
