/**
 * LOCAL document diff for `upgrade` - computed against the design-system.json
 * snapshots on disk, not against the server's version history.
 *
 * Why local: personal design systems mutate their WORKING DRAFT in place under
 * a fixed version number; only publishing freezes it. So the server's "v3" may
 * have moved since this app installed it ("draft drift"), and a server-side
 * v3→v4 changelog can be legitimately empty while the app's files differ. The
 * app's truth is what it has installed - so that's what we diff.
 */

type Dict = Record<string, unknown>;

export type LocalTokenChange = {
  path: string;
  before?: string;
  after?: string;
  kind: "added" | "changed" | "removed";
};

export type LocalNamedChange = {
  name: string;
  kind: "added" | "removed" | "changed";
};

export type LocalChangelog = {
  tokens: LocalTokenChange[];
  components: LocalNamedChange[];
  blocks: LocalNamedChange[];
  breaking: string[];
  isEmpty: boolean;
};

/** Flatten a token subtree into `prefix.path → value` leaves. */
function flattenTokens(
  prefix: string,
  value: unknown,
  out: Map<string, string>,
): void {
  if (value == null) return;
  if (typeof value === "string" || typeof value === "number") {
    out.set(prefix, String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flattenTokens(`${prefix}.${i}`, v, out));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Dict)) {
      flattenTokens(prefix ? `${prefix}.${k}` : k, v, out);
    }
  }
}

/** Key-order-insensitive equality (JSON docs round-trip with unstable order). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Dict)[k], (b as Dict)[k]));
  }
  return false;
}

/** Variant options that existed and disappeared (breaking for the consumer). */
function removedVariantOptions(before: Dict, after: Dict): string[] {
  const out: string[] = [];
  const prevVariants = (before.variants ?? {}) as Record<string, Dict>;
  const nextVariants = (after.variants ?? {}) as Record<string, Dict>;
  for (const [axis, options] of Object.entries(prevVariants)) {
    const nextAxis = nextVariants[axis];
    if (!nextAxis) {
      out.push(axis);
      continue;
    }
    for (const option of Object.keys(options)) {
      if (!(option in nextAxis)) out.push(`${axis}="${option}"`);
    }
  }
  return out;
}

function diffRecipeMaps(
  before: Record<string, Dict>,
  after: Record<string, Dict>,
  label: string,
  breaking: string[],
): LocalNamedChange[] {
  const out: LocalNamedChange[] = [];
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const name of [...names].sort()) {
    const prev = before[name];
    const next = after[name];
    if (!prev) {
      out.push({ name, kind: "added" });
      continue;
    }
    if (!next) {
      out.push({ name, kind: "removed" });
      breaking.push(`${label} "${name}" was removed`);
      continue;
    }
    if (deepEqual(prev, next)) continue;
    out.push({ name, kind: "changed" });
    for (const gone of removedVariantOptions(prev, next)) {
      breaking.push(`${label} "${name}" no longer supports ${gone}`);
    }
  }
  return out;
}

/** Diff two installed design-system.json documents (token + recipe level). */
export function diffLocalDocuments(before: Dict, after: Dict): LocalChangelog {
  const breaking: string[] = [];

  const prevTokens = new Map<string, string>();
  const nextTokens = new Map<string, string>();
  flattenTokens("", before.foundations, prevTokens);
  flattenTokens("motion", before.motion, prevTokens);
  flattenTokens("", after.foundations, nextTokens);
  flattenTokens("motion", after.motion, nextTokens);

  const tokens: LocalTokenChange[] = [];
  const paths = new Set([...prevTokens.keys(), ...nextTokens.keys()]);
  for (const path of [...paths].sort()) {
    const prev = prevTokens.get(path);
    const next = nextTokens.get(path);
    if (prev === next) continue;
    if (prev === undefined) tokens.push({ path, after: next, kind: "added" });
    else if (next === undefined) {
      tokens.push({ path, before: prev, kind: "removed" });
      breaking.push(`token "${path}" was removed`);
    } else tokens.push({ path, before: prev, after: next, kind: "changed" });
  }

  const components = diffRecipeMaps(
    (before.components ?? {}) as Record<string, Dict>,
    (after.components ?? {}) as Record<string, Dict>,
    "component",
    breaking,
  );
  const blocks = diffRecipeMaps(
    (before.blocks ?? {}) as Record<string, Dict>,
    (after.blocks ?? {}) as Record<string, Dict>,
    "block",
    breaking,
  );

  return {
    tokens,
    components,
    blocks,
    breaking,
    isEmpty:
      tokens.length === 0 && components.length === 0 && blocks.length === 0,
  };
}

const CAP_TOKENS = 40;

/** The migration brief body, mirroring the server changelog's format. */
export function localChangelogMarkdown(
  slug: string,
  from: number,
  to: number,
  log: LocalChangelog,
): string {
  const lines: string[] = [
    `# ${slug} - v${from} → v${to}`,
    "",
    `_Diffed against this app's installed v${from} snapshot (the app's truth) -`,
    "personal systems can evolve in place under a version, so a server-side",
    "history diff may miss what changed HERE._",
    "",
  ];
  if (log.isEmpty) {
    lines.push("No visual-contract changes for this app.", "");
    return lines.join("\n");
  }

  if (log.breaking.length > 0) {
    lines.push("## Breaking", "");
    for (const item of log.breaking) lines.push(`- ${item}`);
    lines.push("");
  }

  if (log.tokens.length > 0) {
    lines.push(`## Tokens (${log.tokens.length} change(s))`, "");
    for (const t of log.tokens.slice(0, CAP_TOKENS)) {
      const val =
        t.kind === "removed"
          ? `removed (was \`${t.before}\`)`
          : t.kind === "added"
            ? `added: \`${t.after}\``
            : `\`${t.before}\` → \`${t.after}\``;
      lines.push(`- ${t.path}: ${val}`);
    }
    if (log.tokens.length > CAP_TOKENS) {
      lines.push(`- …and ${log.tokens.length - CAP_TOKENS} more`);
    }
    lines.push("");
  }

  for (const [title, entries] of [
    ["Components", log.components],
    ["Blocks", log.blocks],
  ] as const) {
    if (entries.length === 0) continue;
    lines.push(`## ${title}`, "");
    for (const entry of entries)
      lines.push(`- \`ds-${entry.name}\` - ${entry.kind}`);
    lines.push("");
  }

  return lines.join("\n");
}
