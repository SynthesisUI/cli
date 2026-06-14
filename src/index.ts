#!/usr/bin/env node
import { add } from "./commands/add.js";
import { list } from "./commands/list.js";
import { login } from "./commands/login.js";
import { RegistryError } from "./registry.js";

const HELP = `synthesisui — traz design systems do SynthesisUI para o seu projeto

Uso:
  synthesisui login [opções]           conecta o CLI à sua conta (device-flow)
  synthesisui list [opções]            lista os DSs publicados
  synthesisui add <slug> [opções]      materializa um DS em _synthesisui/ds/<slug>/

Opções:
  --registry <url>   URL do registry (ou env SYNTHESISUI_REGISTRY_URL)
  --dir <path>       raiz do projeto consumidor (default: diretório atual)
  -h, --help         esta ajuda

Exemplos:
  synthesisui login
  synthesisui list
  synthesisui add halogen
  synthesisui add halogen --registry http://localhost:3737
`;

/** Extrai `--flag value` simples e os posicionais restantes. */
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
        console.error("erro: informe o slug — `synthesisui add <slug>`");
        process.exitCode = 1;
        return;
      }
      await add(slug, { registry, dir });
      break;
    }
    case "login":
      await login({ registry });
      break;
    default:
      console.error(`comando desconhecido: "${command}"\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof RegistryError) {
    console.error(`erro: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
