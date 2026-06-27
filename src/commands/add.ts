import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { syncClaudeMd } from "../claude-md.js";
import { resolveRegistry } from "../config.js";
import { buildGuide } from "../guide.js";
import { fetchDesignSystem } from "../registry.js";

type AddOptions = {
  registry?: string;
  /** Consumer project root (default: cwd). */
  dir?: string;
  /** Specific version to install; latest when omitted. */
  version?: number;
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
  console.log("");
  console.log("Next steps:");
  console.log(
    `  • @import "_synthesisui/ds/${payload.slug}/tokens.css" in your global CSS (stable path)`,
  );
  console.log(`  • scope your UI with data-ds="${payload.slug}"`);
  console.log(
    `  • details and rules in _synthesisui/ds/${payload.slug}/v${v}/GUIDE.md`,
  );
}
