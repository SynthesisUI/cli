/**
 * Terminal output helpers - the CLI's DX surface. Principles:
 * - breathing room: blank lines around sections, never a wall of bullets;
 * - concrete over abstract: real paths and copy-pasteable snippets, not
 *   "import it globally";
 * - one idea per section, titled with a scannable ruled heading.
 */

const WIDTH = 66;

/** `── Title ───────────…` ruled section heading (with breathing room). */
export function section(title: string): string {
  const head = `── ${title} `;
  const rest = Math.max(4, WIDTH - head.length);
  return `\n${head}${"─".repeat(rest)}\n`;
}

/** Indented, copy-pasteable code block (empty lines stay truly empty). */
export function snippet(lines: string[]): string {
  return lines.map((line) => (line ? `      ${line}` : "")).join("\n");
}

/** Indented body text line. */
export function body(line: string): string {
  return `  ${line}`;
}
