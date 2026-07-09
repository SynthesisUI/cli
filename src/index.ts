#!/usr/bin/env node
import { add } from "./commands/add.js";
import { advise } from "./commands/advise.js";
import { clean } from "./commands/clean.js";
import { component } from "./commands/component.js";
import { generate } from "./commands/generate.js";
import { init } from "./commands/init.js";
import { list } from "./commands/list.js";
import { login } from "./commands/login.js";
import { refit } from "./commands/refit.js";
import { template } from "./commands/template.js";
import { upgrade } from "./commands/upgrade.js";
import { use } from "./commands/use.js";
import { RegistryError } from "./registry.js";

const HELP = `synthesisui - bring SynthesisUI design systems into your project

Usage - deterministic, FREE:
  synthesisui login [options]              connect the CLI to your account (device-flow)
  synthesisui init [options]               write _synthesisui/config.json (target, dirs); --ds to bring one in
  synthesisui list [options]               list the published design systems
  synthesisui add <slug> [options]         materialize a DS into _synthesisui/ds/<slug>/
  synthesisui component <slug> <name>      bring one EXISTING component in as YOUR <Pascal>.tsx
  synthesisui template <slug> <name>       materialize a whole page from a DS template
                                           (--as landing-home names the output - multi-page safe)
  synthesisui upgrade <slug>               update an installed DS + regenerate your components + migration brief
  synthesisui use <slug> "<intent>"        print a ready-to-paste agent prompt to build/modify on-system
  synthesisui clean [--force]              strip create-next-app boilerplate (dry run without --force)

Usage - AI, USES CREDITS (login required):
  synthesisui generate "<desc>"            AI-create a NEW component your DS doesn't have (token-only recipe)
  synthesisui advise "<value prop>"        AI engagement-pattern proposals for this project
  synthesisui refit <file> [--ds <slug>]   AI-adapt an app component INTO your DS, get it back as code

Options:
  --registry <url>   registry URL (or env SYNTHESISUI_REGISTRY_URL)
  --dir <path>       consumer project root (default: current directory)
  --version <n>      install a specific version (default: latest)
  --ds <slug>        init: bring this DS in right away · generate: target DS (default: installed)
  --name <name>      preferred component name for generate
  --target <t>       template/init target: next | general (default: next)
  --pages-dir <dir>  init: folder for generated pages (default: app)
  --components-dir <dir>  init: folder where components live (default: components)
  --styles <s>       init: component code flavor: css | tailwind (default: css)
  --artifacts-only   component: skip the .tsx materialization (recipe + css only)
  --interactive      component: materialize the rich/behaving variant (join-field, streak, xp-bar)
  --replace <name>   refit: replace an existing DS component (keeps its name)
  --support <file>   refit: supporting CSS file (globals/vars the code references)
  --instruction <s>  refit: extra guidance for the adaptation
  --dry              refit: adapt and print, but save nothing
  --force            clean: apply the changes (without it, dry run)
  --out <path>       output path for the generated template (default: <pagesDir>/<file>)
  -h, --help         this help

Examples:
  synthesisui login
  synthesisui init --target next
  synthesisui init --target next --ds halogen   bootstrap + bring a system in
  synthesisui list
  synthesisui add halogen
  synthesisui add halogen --version 3
  synthesisui template halogen dashboard-sidebar
  synthesisui template halogen landing --out app/page.tsx
  synthesisui component halogen pricing-tier
  synthesisui use halogen "a pricing section with three tiers and a highlighted plan"
  synthesisui use halogen "make the card shadow softer in components/StatCard.tsx"
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
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        // `--key=value` form (e.g. --out=templates/page.tsx)
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        // `--key value` form
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[body] = next;
          i++;
        } else {
          flags[body] = true;
        }
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
      const pagesDir =
        typeof flags["pages-dir"] === "string" ? flags["pages-dir"] : undefined;
      const componentsDir =
        typeof flags["components-dir"] === "string"
          ? flags["components-dir"]
          : undefined;
      const ds = typeof flags.ds === "string" ? flags.ds : undefined;
      const styles =
        typeof flags.styles === "string" ? flags.styles : undefined;
      await init({
        dir,
        registry,
        target,
        pagesDir,
        componentsDir,
        styles,
        ds,
      });
      break;
    }
    // `page` is the legacy alias (renamed to `template`); it still works so
    // GUIDE.md files materialized before the rename don't break.
    case "page":
    case "template": {
      if (command === "page") {
        console.error(
          "note: `synthesisui page` was renamed to `synthesisui template` - the old name still works for now.",
        );
      }
      const slug = args[0];
      const name = args[1];
      if (!slug || !name) {
        console.error(
          "error: provide slug and template name - `synthesisui template <slug> <name>`",
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
      const as_ = typeof flags.as === "string" ? flags.as : undefined;
      await template(slug, name, {
        registry,
        dir,
        out,
        target,
        version,
        as: as_,
      });
      break;
    }
    case "component": {
      const slug = args[0];
      const name = args[1];
      if (!slug || !name) {
        console.error(
          "error: provide slug and component name - `synthesisui component <slug> <name>`",
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
      await component(slug, name, {
        registry,
        dir,
        version,
        artifactsOnly: flags["artifacts-only"] === true,
        interactive: flags.interactive === true,
      });
      break;
    }
    case "refit": {
      const file = args[0];
      if (!file) {
        console.error(
          "error: provide the component file - `synthesisui refit <file> [--ds <slug>]`",
        );
        process.exitCode = 1;
        return;
      }
      await refit(file, {
        registry,
        dir,
        ds: typeof flags.ds === "string" ? flags.ds : undefined,
        name: typeof flags.name === "string" ? flags.name : undefined,
        replace: typeof flags.replace === "string" ? flags.replace : undefined,
        instruction:
          typeof flags.instruction === "string" ? flags.instruction : undefined,
        support: typeof flags.support === "string" ? flags.support : undefined,
        dry: flags.dry === true,
      });
      break;
    }
    case "upgrade": {
      const slug = args[0];
      if (!slug) {
        console.error("error: provide the slug - `synthesisui upgrade <slug>`");
        process.exitCode = 1;
        return;
      }
      await upgrade(slug, { registry, dir });
      break;
    }
    case "use": {
      const slug = args[0];
      if (!slug) {
        console.error(
          'error: provide the slug and your intent - `synthesisui use <slug> "<intent>"`',
        );
        process.exitCode = 1;
        return;
      }
      const intent = args.slice(1).join(" ").trim();
      await use(slug, intent, { dir });
      break;
    }
    case "clean":
      await clean({ dir, force: flags.force === true });
      break;
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
