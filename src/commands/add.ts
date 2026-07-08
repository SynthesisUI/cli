import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncClaudeMd } from "../claude-md.js";
import { readProjectConfig, resolveRegistry } from "../config.js";
import {
  customFontFamilies,
  googleFontsHref,
  nextFontSnippet,
} from "../fonts.js";
import { buildGuide } from "../guide.js";
import { body as line, section, snippet } from "../output.js";
import { fetchDesignSystem } from "../registry.js";

type AddOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Specific version to install; latest when omitted. */
  version?: number;
  /** Print the one-time setup + next-steps sections (default true; `upgrade`
   *  suppresses them - the app is already wired). */
  setupHints?: boolean;
};

/** Root pointer at `_synthesisui/ds/<slug>/.lock` - names the active version. */
type RootLock = {
  slug: string;
  name: string;
  version: number;
  registry: string;
  fetchedAt: string;
};

async function readRootLock(path: string): Promise<RootLock | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RootLock;
  } catch {
    return null;
  }
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/**
 * Where the app's routes live: the configured pagesDir at the project root
 * (`app/`) or nested under `src/` (`src/app/` - create-next-app's other
 * layout). Null when neither exists (instructions-only mode).
 */
async function detectAppDir(
  root: string,
  pagesDir: string,
): Promise<string | null> {
  if (await exists(join(root, pagesDir))) return pagesDir;
  if (await exists(join(root, "src", pagesDir))) return `src/${pagesDir}`;
  return null;
}

/**
 * Materializes a published DS into `_synthesisui/ds/<slug>/v<version>/`, points
 * stable root re-exports (tokens.css/theme.css) and a `.lock` at it, and updates
 * CLAUDE.md. Older version folders are kept for rollback/diff.
 */
export async function add(slug: string, opts: AddOptions): Promise<void> {
  const base = resolveRegistry(opts.registry);
  const projectRoot = opts.dir ?? process.cwd();

  const label = opts.version != null ? `${slug}@v${opts.version}` : slug;
  console.log(`→ fetching "${label}" from ${base} …`);
  const payload = await fetchDesignSystem(base, slug, opts.version);

  const slugDir = join(projectRoot, "_synthesisui", "ds", payload.slug);
  const versionDir = join(slugDir, `v${payload.version}`);
  const rootLockPath = join(slugDir, ".lock");

  // know what was active before, to report install vs update vs switch
  const prev = await readRootLock(rootLockPath);

  await mkdir(versionDir, { recursive: true });

  // 1. server artifacts (tokens.css, theme.css, …) → pinned version folder
  for (const [filename, content] of Object.entries(payload.artifacts)) {
    await writeFile(join(versionDir, filename), content, "utf8");
  }

  // 2. canonical source of truth
  await writeFile(
    join(versionDir, "design-system.json"),
    `${JSON.stringify(payload.document, null, 2)}\n`,
    "utf8",
  );

  // 3. guide for the agent (generated client-side from the document)
  await writeFile(join(versionDir, "GUIDE.md"), buildGuide(payload), "utf8");

  // 4. stable root re-exports for each CSS artifact → always the active version,
  //    so the consumer's @import path never changes across updates
  const cssArtifacts = Object.keys(payload.artifacts).filter((f) =>
    f.endsWith(".css"),
  );
  for (const filename of cssArtifacts) {
    await writeFile(
      join(slugDir, filename),
      `/* Active version (v${payload.version}). Managed by synthesisui - do not edit. */\n` +
        `@import "./v${payload.version}/${filename}";\n`,
      "utf8",
    );
  }

  // 5. root pointer
  const lock: RootLock = {
    slug: payload.slug,
    name: payload.name,
    version: payload.version,
    registry: base,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(rootLockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  // 5b. governance rules (personal DS) → rules.md at the slug root (stable path,
  //     highest authority; the GUIDE tells the agent to read it first)
  const rules = payload.rules ?? [];
  if (rules.length > 0) {
    const body =
      `# ${payload.name} - Rules\n\n` +
      "> Accumulated rules for this design system. **Max authority - follow these first.**\n" +
      `> Managed by synthesisui (edit in the studio). ${rules.length} rule(s).\n\n${rules
        .map((r) => `- ${r}`)
        .join("\n")}\n`;
    await writeFile(join(slugDir, "rules.md"), body, "utf8");
  }

  // 5c. structured philosophy (personal DS) → philosophy.md at the slug root.
  //     Narrative guidance (mission, principles, voice, motion doctrine…); the
  //     GUIDE points the agent here right after rules.md.
  const philosophy = payload.document.philosophy;
  const sections = philosophy?.sections ?? [];
  if (sections.length > 0 || philosophy?.context) {
    const parts = [`# ${payload.name} - Philosophy`, ""];
    parts.push(
      "> The voice and principles behind this system. Read after rules.md;",
      "> let it shape every screen. Managed by synthesisui (edit in the studio).",
      "",
    );
    if (philosophy?.context) {
      parts.push("## What this product is", "", philosophy.context, "");
    }
    for (const s of sections) {
      parts.push(`## ${s.title}`, "", s.body, "");
    }
    await writeFile(
      join(slugDir, "philosophy.md"),
      `${parts.join("\n")}\n`,
      "utf8",
    );
  }

  // 6. discovery by the agent
  const claudeMd = await syncClaudeMd(projectRoot);

  // outcome line
  const v = payload.version;
  if (!prev) {
    console.log(
      `✓ ${payload.name} v${v} installed → _synthesisui/ds/${payload.slug}/`,
    );
  } else if (prev.version === v) {
    console.log(
      `✓ ${payload.name} v${v} already installed${opts.version == null ? " (latest)" : ""} - refreshed`,
    );
  } else if (v > prev.version) {
    console.log(
      `↑ ${payload.name} v${prev.version} → v${v} (kept v${prev.version}/ for rollback)`,
    );
  } else {
    console.log(
      `↺ ${payload.name} active version set to v${v} (was v${prev.version})`,
    );
  }

  const files = [
    ...Object.keys(payload.artifacts),
    "design-system.json",
    "GUIDE.md",
  ];
  console.log(`  v${v}/: ${files.join(", ")}`);
  if (rules.length > 0) {
    console.log(`  rules.md → ${rules.length} rule(s) (read these first)`);
  }
  if (sections.length > 0 || philosophy?.context) {
    console.log(
      `  philosophy.md → ${sections.length} section(s) (read after rules)`,
    );
  }
  console.log(
    `  CLAUDE.md ${claudeMd.created ? "created" : "updated"} (${claudeMd.count} system(s) installed)`,
  );
  if (opts.setupHints === false) return;
  const hasTheme = cssArtifacts.includes("theme.css");

  // ── DX: concrete paths + copy-pasteable snippets, with breathing room ──
  // Where the app actually lives (app/ vs src/app/) drives every printed
  // path: the @import depth, the layout example, and where fonts.ts lands.
  const projectConfig = await readProjectConfig(projectRoot);
  const appDir =
    (await detectAppDir(projectRoot, projectConfig.pagesDir)) ??
    projectConfig.pagesDir;
  const importPrefix = "../".repeat(appDir.split("/").length);

  console.log(section("One-time setup (once per app)"));
  console.log(
    line(
      `1. Import the system in your GLOBAL stylesheet, e.g. ${appDir}/globals.css`,
    ),
  );
  console.log(
    line(
      `   (the path is relative to that file - hence the leading ${importPrefix}):`,
    ),
  );
  console.log("");
  console.log(
    snippet(
      hasTheme
        ? [
            `@import "tailwindcss";`,
            `@import "${importPrefix}_synthesisui/ds/${payload.slug}/tokens.css";`,
            `@import "${importPrefix}_synthesisui/ds/${payload.slug}/theme.css";  /* Tailwind utilities on your tokens */`,
          ]
        : [
            `@import "${importPrefix}_synthesisui/ds/${payload.slug}/tokens.css";`,
          ],
    ),
  );
  console.log("");
  console.log(
    line(
      `2. Scope your app: add data-ds="${payload.slug}" to a ROOT element, e.g. ${appDir}/layout.tsx:`,
    ),
  );
  console.log("");
  console.log(snippet([`<body data-ds="${payload.slug}">{children}</body>`]));

  // 3. Load the type - the DS ships token NAMES, not the fonts themselves.
  //    Next apps get fonts.ts MATERIALIZED (deterministic does, not teaches):
  //    next/font = self-hosted + preloaded + adjusted fallback, no FOUT
  //    "blink". The Google Fonts <link> stays as the framework-agnostic path.
  const families = payload.document.foundations.typography.families;
  const fontsHref = googleFontsHref(families);
  const nextFonts =
    projectConfig.target === "next"
      ? nextFontSnippet(families, payload.slug, appDir)
      : null;
  if (nextFonts) {
    const fontsPath = join(projectRoot, ...appDir.split("/"), "fonts.ts");
    let wroteFonts = false;
    if (
      !(await exists(fontsPath)) &&
      (await exists(join(projectRoot, ...appDir.split("/"))))
    ) {
      const header = [
        `// Self-hosted type for the "${payload.slug}" design system (via next/font -`,
        `// preloaded, no font flash). Generated by \`synthesisui add\`; edit freely.`,
      ];
      await writeFile(
        fontsPath,
        `${[...header, ...nextFonts.fontsFile.slice(1)].join("\n")}\n`,
        "utf8",
      );
      wroteFonts = true;
    }

    console.log("");
    if (wroteFonts) {
      console.log(
        line(
          `3. ✓ wrote ${appDir}/fonts.ts - self-hosted type via next/font (preloaded, no font flash).`,
        ),
      );
      console.log(line("   Finish the wiring with two small edits:"));
    } else {
      console.log(
        line(
          `3. Load the type via next/font (${appDir}/fonts.ts already exists - left untouched; it should export:)`,
        ),
      );
      console.log("");
      console.log(snippet(nextFonts.fontsFile));
      console.log("");
      console.log(line("   Then finish the wiring:"));
    }
    console.log("");
    console.log(snippet(nextFonts.layout));
    console.log("");
    console.log(snippet(nextFonts.css));
    if (fontsHref) {
      console.log("");
      console.log(
        line(
          `   Quick alternative (works anywhere, may flash on cold loads): <link rel="stylesheet" href="${fontsHref}" /> in the <head>.`,
        ),
      );
    }
  } else if (fontsHref) {
    console.log("");
    console.log(
      line(
        "3. Load the type - this system ships font NAMES, not the fonts. Add to your app's <head> (e.g. app/layout.tsx) so the families resolve (else they fall back and the look is lost):",
      ),
    );
    console.log("");
    console.log(
      snippet([
        `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
        `<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />`,
        `<link rel="stylesheet" href="${fontsHref}" />`,
      ]),
    );
    console.log("");
    console.log(
      line(
        `   Prefer next/font or self-hosting? Fine - just register these exact families: ${customFontFamilies(families).join(", ")}.`,
      ),
    );
  }

  console.log(section("Next"));
  console.log(
    line(
      `synthesisui component ${payload.slug} button    bring a component in as YOUR code`,
    ),
  );
  console.log(
    line(
      `synthesisui template ${payload.slug} landing    materialize a whole page`,
    ),
  );
  console.log("");
  console.log(
    line(
      `Guide for you and your agent: _synthesisui/ds/${payload.slug}/v${v}/GUIDE.md`,
    ),
  );
  console.log("");
}
