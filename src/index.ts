#!/usr/bin/env node
import { add } from "./commands/add.js";
import { advise } from "./commands/advise.js";
import { generate } from "./commands/generate.js";
import { init } from "./commands/init.js";
import { list } from "./commands/list.js";
import { login } from "./commands/login.js";
import { page } from "./commands/page.js";
import { RegistryError } from "./registry.js";

const HELP = `synthesisui - bring SynthesisUI design systems into your project

Usage:
  synthesisui login [options]              connect the CLI to your account (device-flow)
  synthesisui init [options]               write _synthesisui/config.json (target + pages dir)
  synthesisui list [options]               list the published design systems
  synthesisui add <slug> [options]         materialize a DS into _synthesisui/ds/<slug>/
  synthesisui page <slug> <template>       materialize a whole page from a DS template
  synthesisui advise "<value prop>"        engagement-pattern proposals for this project (login required)
  synthesisui generate "<desc>"            generate a token-only component recipe for your DS (login required)

Options:
  --registry <url>   registry URL (or env SYNTHESISUI_REGISTRY_URL)
  --dir <path>       consumer project root (default: current directory)
  --version <n>      install a specific version (default: latest)
  --ds <slug>        target design system for generate (default: the installed one)
  --name <name>      preferred component name for generate
  --target <t>       page/init target: next | general (default: next)
  --out <path>       output path for the generated page (default: <pagesDir>/<file>)
  -h, --help         this help

Examples:
  synthesisui login
  synthesisui init --target next
  synthesisui list
  synthesisui add halogen
  synthesisui add halogen --version 3
  synthesisui page halogen dashboard-sidebar
  synthesisui page halogen landing --out app/page.tsx
  synthesisui advise "habit-building app for tracking personal finances"
  synthesisui generate "an upgrade banner with a title, message and a primary CTA"
`;

/** Extracts simple `--flag value` pairs and the remaining positionals. */
function parseFlags(argv: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

async function main() {
  const { positionals, flags } = parseFlags(process.argv.slice(2));
  const [command, ...args] = positionals;

  if (!command || flags.help || command === "help") {
    console.log(HELP);
    return;
  }

  const registry =
    typeof flags.registry === "string" ? flags.registry : undefined;
  const dir = typeof flags.dir === "string" ? flags.dir : undefined;

  switch (command) {
    case "list":
      await list({ registry });
      break;
    case "add": {
      const slug = args[0];
      if (!slug) {
        console.error("error: provide the slug - `synthesisui add <slug>`");
        process.exitCode = 1;
        return;
      }
      let version: number | undefined;
      if (typeof flags.version === "string") {
        version = Number.parseInt(flags.version.replace(/^v/i, ""), 10);
        if (!Number.isInteger(version) || version < 1) {
          console.error(
            `error: invalid --version "${flags.version}" - use an integer ≥ 1`,
          );
          process.exitCode = 1;
          return;
        }
      }
      await add(slug, { registry, dir, version });
      break;
    }
    case "login":
      await login({ registry });
      break;
    case "init": {
      const target =
        typeof flags.target === "string" ? flags.target : undefined;
      await init({ dir, target });
      break;
    }
    case "page": {
      const slug = args[0];
      const template = args[1];
      if (!slug || !template) {
        console.error(
          "error: provide slug and template - `synthesisui page <slug> <template>`",
        );
        process.exitCode = 1;
        return;
      }
      let version: number | undefined;
      if (typeof flags.version === "string") {
        version = Number.parseInt(flags.version.replace(/^v/i, ""), 10);
        if (!Number.isInteger(version) || version < 1) {
          console.error(
            `error: invalid --version "${flags.version}" - use an integer ≥ 1`,
          );
          process.exitCode = 1;
          return;
        }
      }
      const target =
        typeof flags.target === "string" ? flags.target : undefined;
      const out = typeof flags.out === "string" ? flags.out : undefined;
      await page(slug, template, { registry, dir, out, target, version });
      break;
    }
    case "advise": {
      const valueProp = args.join(" ").trim();
      if (!valueProp) {
        console.error(
          'error: describe your product - `synthesisui advise "<value proposition>"`',
        );
        process.exitCode = 1;
        return;
      }
      await advise(valueProp, { registry, dir });
      break;
    }
    case "generate": {
      const description = args.join(" ").trim();
      if (!description) {
        console.error(
          'error: describe the component - `synthesisui generate "<description>"`',
        );
        process.exitCode = 1;
        return;
      }
      const ds = typeof flags.ds === "string" ? flags.ds : undefined;
      const name = typeof flags.name === "string" ? flags.name : undefined;
      await generate(description, { registry, dir, ds, name });
      break;
    }
    default:
      console.error(`unknown command: "${command}"\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof RegistryError) {
    console.error(`error: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
