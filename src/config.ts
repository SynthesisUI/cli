import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Default registry (canonical production domain). Overridable via
 * `--registry <url>` or `SYNTHESISUI_REGISTRY_URL` (e.g. http://localhost:3000
 * in dev).
 */
export const DEFAULT_REGISTRY = "https://www.synthesisui.com";

export function resolveRegistry(flag?: string): string {
  const base = flag || process.env.SYNTHESISUI_REGISTRY_URL || DEFAULT_REGISTRY;
  return base.replace(/\/+$/, ""); // no trailing slash
}

/** Where the device-flow token lives — per machine, in the home dir. */
export const credentialsPath = join(
  homedir(),
  ".synthesisui",
  "credentials.json",
);

/**
 * Reads the saved token, if any. Optional for now (open gate); the device-flow
 * is what writes it. Sent as a Bearer header when present.
 */
export async function readToken(): Promise<string | null> {
  try {
    const raw = await readFile(credentialsPath, "utf8");
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

/** Persists the device-flow token (chmod 600, user-only dir). */
export async function writeToken(
  token: string,
  registry: string,
): Promise<void> {
  await mkdir(dirname(credentialsPath), { recursive: true, mode: 0o700 });
  const payload = { token, registry, savedAt: new Date().toISOString() };
  await writeFile(credentialsPath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });
}
