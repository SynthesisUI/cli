import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Registry padrão. Sobrescrevível por `--registry <url>` ou
 * `SYNTHESISUI_REGISTRY_URL` (ex.: http://localhost:3737 em dev).
 * O domínio canônico de produção é definido no Marco G.
 */
export const DEFAULT_REGISTRY = "https://synthesisui.vercel.app";

export function resolveRegistry(flag?: string): string {
  const base = flag || process.env.SYNTHESISUI_REGISTRY_URL || DEFAULT_REGISTRY;
  return base.replace(/\/+$/, ""); // sem barra final
}

/** Onde o token do device-flow (passo 3) vive — por máquina, na home. */
export const credentialsPath = join(
  homedir(),
  ".synthesisui",
  "credentials.json",
);

/**
 * Lê o token salvo, se existir. Hoje opcional (portão aberto); o device-flow
 * (passo 3) é quem vai gravá-lo. Mandamos como Bearer quando presente.
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

/** Persiste o token do device-flow (chmod 600, dir só do usuário). */
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
