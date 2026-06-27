import { spawn } from "node:child_process";
import { resolveRegistry, writeToken } from "../config.js";
import { RegistryError } from "../registry.js";

const CLIENT_ID = "synthesisui-cli";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tries to open the OS browser; silent if it fails. */
function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd as string, args as string[], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // no browser available - the user opens it manually
  }
}

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

/** Device authorization (RFC 8628): opens the browser, waits for approval. */
export async function login(opts: { registry?: string }): Promise<void> {
  const base = resolveRegistry(opts.registry);

  const codeRes = await fetch(`${base}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  }).catch(() => null);

  if (!codeRes || !codeRes.ok) {
    throw new RegistryError(
      `Could not start login at ${base}` +
        (codeRes
          ? ` (HTTP ${codeRes.status}).`
          : ". Check the URL and your connection."),
    );
  }
  const code = (await codeRes.json()) as DeviceCode;

  console.log("\nTo connect the CLI to your account:");
  console.log(`  1. open: ${code.verification_uri}`);
  console.log(`  2. confirm the code: ${code.user_code}\n`);
  console.log("(trying to open the browser…)");
  openBrowser(code.verification_uri_complete);

  let interval = (code.interval || 5) * 1000;
  const deadline = Date.now() + (code.expires_in || 900) * 1000;
  process.stdout.write("waiting for approval");

  while (Date.now() < deadline) {
    await sleep(interval);
    process.stdout.write(".");

    const tokenRes = await fetch(`${base}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: GRANT_TYPE,
        device_code: code.device_code,
        client_id: CLIENT_ID,
      }),
    }).catch(() => null);

    const data = tokenRes
      ? ((await tokenRes.json().catch(() => ({}))) as Record<string, unknown>)
      : {};

    if (tokenRes?.ok && typeof data.access_token === "string") {
      await writeToken(data.access_token, base);
      console.log(
        "\n✓ Login complete. Token saved to ~/.synthesisui/credentials.json",
      );
      return;
    }

    const err = data.error as string | undefined;
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      interval += 5000;
      continue;
    }
    throw new RegistryError(
      `\nLogin failed: ${(data.error_description as string) ?? err ?? tokenRes?.status ?? "unknown error"}`,
    );
  }
  throw new RegistryError(
    "\nThe code expired before approval. Run `synthesisui login` again.",
  );
}
