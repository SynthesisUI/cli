import type { ComponentRecipe, StyleBlock } from "./types.js";

/**
 * Deterministic recipe → React component codegen (the "bring it as MY code"
 * half of the platform↔app bridge). Two flavors, picked by the project config:
 *
 * - `styles: "css"` - a thin TSX over the compiled `ds-*` classes, importing a
 *   colocated `<name>.css`. Updating that css re-dresses the component; the
 *   TSX never needs to change.
 * - `styles: "tailwind"` - the recipe is translated to Tailwind utilities
 *   inline in the TSX (resolved by the DS's `theme.css` @theme adapter).
 *   The code is fully yours; token changes still propagate via CSS vars.
 *
 * Both flavors expose the SAME props API: each variant axis becomes a typed
 * prop; in css mode it maps to the `data-<axis>` attribute the compiled CSS
 * selects on, in tailwind mode it picks a class list. States (hover/focus/…)
 * are CSS-only in both.
 *
 * Shared global setup (once per app, done by `synthesisui add`):
 * import `tokens.css` (+ `theme.css` for tailwind) and put `data-ds="<slug>"`
 * on a root element - that's the boundary: tokens are global, everything a
 * component owns lives in its own folder.
 */

export type GeneratedComponentFile = { filename: string; code: string };

const kebab = (v: string) =>
  v.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const pascal = (name: string) =>
  name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");

const camel = (name: string) => {
  const p = pascal(name);
  return p[0].toLowerCase() + p.slice(1);
};

/** Intrinsic element + extra attrs per component, chosen like the platform
 *  renderer does (name first, then preview.kind). Fallback: div + children. */
function elementFor(
  name: string,
  recipe: ComponentRecipe,
): { tag: string; attrs: string; voidEl: boolean } {
  const byName: Record<string, { tag: string; attrs?: string }> = {
    input: { tag: "input" },
    textarea: { tag: "textarea" },
    select: { tag: "select" },
    checkbox: { tag: "input", attrs: ' type="checkbox"' },
    radio: { tag: "input", attrs: ' type="radio"' },
    switch: { tag: "input", attrs: ' type="checkbox" role="switch"' },
    slider: { tag: "input", attrs: ' type="range"' },
    button: { tag: "button", attrs: ' type="button"' },
    "icon-button": { tag: "button", attrs: ' type="button"' },
    badge: { tag: "span" },
    tag: { tag: "span" },
    avatar: { tag: "span" },
    divider: { tag: "hr" },
    link: { tag: "a" },
  };
  const hit =
    byName[name] ??
    (recipe.preview?.kind === "action"
      ? { tag: "button", attrs: ' type="button"' }
      : undefined);
  const tag = hit?.tag ?? "div";
  return {
    tag,
    attrs: hit?.attrs ?? "",
    voidEl: tag === "input" || tag === "hr",
  };
}

type Axis = {
  /** Original key in recipe.variants (lookups). */
  key: string;
  prop: string;
  attr: string;
  boolean: boolean;
  /** True when the recipe styles the "false" option too. */
  styledFalse: boolean;
  options: string[];
};

/** Variant axes → typed props. An axis whose options ⊆ {true,false} is a
 *  boolean prop; empty axes (no visual effect) are skipped. */
function axesOf(variants: ComponentRecipe["variants"]): Axis[] {
  const axes: Axis[] = [];
  for (const [axis, options] of Object.entries(variants ?? {})) {
    const keys = Object.keys(options).filter(
      (k) => Object.keys(options[k] ?? {}).length > 0,
    );
    if (keys.length === 0) continue;
    axes.push({
      key: axis,
      prop: camel(axis),
      attr: kebab(axis),
      boolean: keys.every((k) => k === "true" || k === "false"),
      styledFalse: keys.includes("false"),
      options: keys,
    });
  }
  return axes;
}

function propsType(axes: Axis[], tag: string): string {
  const extras = axes.map((a) =>
    a.boolean
      ? `  ${a.prop}?: boolean;`
      : `  ${a.prop}?: ${a.options.map((o) => `"${o}"`).join(" | ")};`,
  );
  if (extras.length === 0) return `ComponentPropsWithoutRef<"${tag}">`;
  return `ComponentPropsWithoutRef<"${tag}"> & {\n${extras.join("\n")}\n}`;
}

function dataAttrLines(axes: Axis[]): string {
  return axes
    .map((a) =>
      a.boolean
        ? a.styledFalse
          ? `      data-${a.attr}={${a.prop} ? "true" : "false"}`
          : `      data-${a.attr}={${a.prop} ? "true" : undefined}`
        : `      data-${a.attr}={${a.prop}}`,
    )
    .join("\n");
}

// ── Tailwind translation ─────────────────────────────────────────────────────

/**
 * Namespace-aware token key: returns the utility suffix ONLY when the ref
 * lives in a namespace the `theme.css` @theme adapter actually maps
 * (semantic/series colors, spacing, radius, shadow, families, weights, type
 * scale). Anything else (e.g. color primitives) must use the --ds-* fallback.
 */
const nsKey = (v: string, ns: string): string | null => {
  const m = v.match(
    new RegExp(`^\\{${ns.replace(/\./g, "\\.")}\\.([a-zA-Z0-9-]+)\\}$`),
  );
  return m ? kebab(m[1]) : null;
};

/** Color refs the adapter maps: semantic → <role>, series → series-<n>. */
const colorKey = (v: string): string | null => {
  const semantic = nsKey(v, "color.semantic");
  if (semantic) return semantic;
  const series = nsKey(v, "color.series");
  if (series) return `series-${series}`;
  return null;
};

/** "{typography.scale.sm.fontSize}" → "sm" (the --text-<key> utility). */
const scaleKey = (v: string): string | null => {
  const m = v.match(/^\{typography\.scale\.([a-zA-Z0-9-]+)\.fontSize\}$/);
  return m ? kebab(m[1]) : null;
};

/** "{color.semantic.primary}" → "var(--ds-color-semantic-primary)" - the raw
 *  scoped vars always exist, so arbitrary-property fallbacks never dangle. */
const refToDsVar = (v: string): string =>
  v.replace(/\{([a-z0-9.-]+)\}/gi, (_, path: string) => {
    return `var(--ds-${path.split(".").map(kebab).join("-")})`;
  });

/** Arbitrary-property escape hatch: guaranteed-faithful when no pretty utility
 *  exists. Spaces become underscores per Tailwind's arbitrary syntax. */
const arbitrary = (prop: string, value: string): string =>
  `[${kebab(prop)}:${refToDsVar(value).replace(/\s+/g, "_")}]`;

const STATIC: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    "inline-flex": "inline-flex",
    grid: "grid",
    block: "block",
    "inline-block": "inline-block",
    none: "hidden",
  },
  alignItems: {
    center: "items-center",
    "flex-start": "items-start",
    "flex-end": "items-end",
    baseline: "items-baseline",
    stretch: "items-stretch",
  },
  justifyContent: {
    center: "justify-center",
    "space-between": "justify-between",
    "flex-start": "justify-start",
    "flex-end": "justify-end",
  },
  flexDirection: { column: "flex-col", row: "flex-row" },
  textAlign: { center: "text-center", left: "text-left", right: "text-right" },
  cursor: { pointer: "cursor-pointer", "not-allowed": "cursor-not-allowed" },
  width: { "100%": "w-full" },
  height: { "100%": "h-full" },
  textDecoration: { none: "no-underline", underline: "underline" },
};

/** One declaration → Tailwind classes (pretty when mappable, arbitrary-property
 *  otherwise - never dropped). */
function declToTailwind(prop: string, value: string): string[] {
  const stat = STATIC[prop]?.[value];
  if (stat) return [stat];

  switch (prop) {
    case "backgroundColor": {
      if (value === "transparent") return ["bg-transparent"];
      const key = colorKey(value);
      if (key) return [`bg-${key}`];
      break;
    }
    case "color": {
      const key = colorKey(value);
      if (key) return [`text-${key}`];
      break;
    }
    case "borderColor": {
      const key = colorKey(value);
      if (key) return [`border-${key}`];
      break;
    }
    case "border": {
      // "1px solid {color.semantic.x}" → border + border-<x>
      const m = value.match(/^1px\s+solid\s+(\{[^}]+\})$/);
      if (m) {
        const key = colorKey(m[1]);
        if (key) return ["border", `border-${key}`];
      }
      break;
    }
    case "borderRadius": {
      const key = nsKey(value, "radius");
      if (key) return [`rounded-${key}`];
      break;
    }
    case "gap": {
      const key = nsKey(value, "spacing");
      if (key) return [`gap-${key}`];
      break;
    }
    case "padding": {
      const keys = value.split(/\s+/).map((v) => nsKey(v, "spacing"));
      if (keys.length === 1 && keys[0]) return [`p-${keys[0]}`];
      if (keys.length === 2 && keys[0] && keys[1])
        return [`py-${keys[0]}`, `px-${keys[1]}`];
      break;
    }
    case "fontSize": {
      const key = scaleKey(value);
      if (key) return [`text-${key}`];
      break;
    }
    case "fontFamily": {
      const key = nsKey(value, "typography.families");
      if (key) return [`font-${key}`];
      break;
    }
    case "fontWeight": {
      const key = nsKey(value, "typography.weights");
      if (key) return [`font-${key}`];
      break;
    }
    case "boxShadow": {
      const key = nsKey(value, "shadow");
      if (key) return [`shadow-${key}`];
      break;
    }
    case "lineHeight":
      // usually paired with the same scale's fontSize (text-<key> carries the
      // scale's line-height via --text-<key>--line-height)
      if (/^\{typography\.scale\./.test(value)) return [];
      break;
  }
  return [arbitrary(prop, value)];
}

const STATE_PREFIX: Record<string, string> = {
  hover: "hover:",
  focus: "focus:",
  focusVisible: "focus-visible:",
  active: "active:",
  disabled: "disabled:",
};

function blockToTailwind(block: StyleBlock, prefix = ""): string[] {
  return Object.entries(block).flatMap(([prop, value]) =>
    declToTailwind(prop, value).map((cls) => `${prefix}${cls}`),
  );
}

function tailwindClassList(recipe: {
  base: StyleBlock;
  states?: Record<string, StyleBlock>;
}): string {
  const classes = [
    ...blockToTailwind(recipe.base),
    ...Object.entries(recipe.states ?? {}).flatMap(([state, block]) =>
      STATE_PREFIX[state] ? blockToTailwind(block, STATE_PREFIX[state]) : [],
    ),
  ];
  return classes.join(" ");
}

// ── Emission ─────────────────────────────────────────────────────────────────

function header(slug: string, name: string, version: number, mode: string) {
  const setup =
    mode === "tailwind"
      ? `import _synthesisui/ds/${slug}/theme.css (Tailwind adapter) + tokens.css`
      : `import _synthesisui/ds/${slug}/tokens.css`;
  return [
    `// Generated by SynthesisUI - "${name}" from the "${slug}" design system (v${version}).`,
    `// On-system by construction: every style resolves to the DS tokens.`,
    `// Global setup (once per app): ${setup}`,
    `// and put data-ds="${slug}" on a root element (e.g. <body data-ds="${slug}">).`,
  ].join("\n");
}

const joinCls = (parts: string[]) =>
  `[${parts.join(", ")}].filter(Boolean).join(" ")`;

function emitCssMode(
  slug: string,
  name: string,
  recipe: ComponentRecipe,
  version: number,
): string {
  const { tag, attrs, voidEl } = elementFor(name, recipe);
  const axes = axesOf(recipe.variants);
  const comp = pascal(name);
  const propNames = axes.map((a) => a.prop);
  const destructure = [...propNames, "className", "...props"].join(", ");

  void voidEl; // both void and container elements self-close ({...props} carries children)
  const rootJsx = `    <${tag}${attrs}\n      className={${joinCls([`"ds-${name}"`, "className"])}}\n${dataAttrLines(axes)}${axes.length ? "\n" : ""}      {...props}\n    />`;

  const parts = Object.entries(recipe.parts ?? {}).map(([partName, part]) => {
    const partAxes = axesOf(part.variants ?? {});
    const partComp = `${comp}${pascal(partName)}`;
    const partDestructure = [
      ...partAxes.map((a) => a.prop),
      "className",
      "...props",
    ].join(", ");
    return `
/** Part "${partName}" of ${comp} - compose it inside <${comp}>. */
export function ${partComp}({ ${partDestructure} }: ${propsType(partAxes, "div")}) {
  return (
    <div
      className={${joinCls([`"ds-${name}-${kebab(partName)}"`, "className"])}}
${dataAttrLines(partAxes)}${partAxes.length ? "\n" : ""}      {...props}
    />
  );
}`;
  });

  return `${header(slug, name, version, "css")}
import "./${name}.css";

import type { ComponentPropsWithoutRef } from "react";

type ${comp}Props = ${propsType(axes, tag)};

export function ${comp}({ ${destructure} }: ${comp}Props) {
  return (
${rootJsx}
  );
}
${parts.join("\n")}`;
}

function emitTailwindMode(
  slug: string,
  name: string,
  recipe: ComponentRecipe,
  version: number,
): string {
  const { tag, attrs, voidEl } = elementFor(name, recipe);
  const axes = axesOf(recipe.variants);
  const comp = pascal(name);

  const variantConsts = axes
    .filter((a) => !a.boolean)
    .map((a) => {
      const entries = a.options
        .map(
          (o) =>
            `  ${JSON.stringify(o)}: ${JSON.stringify(
              blockToTailwind(recipe.variants[a.key]?.[o] ?? {}).join(" "),
            )},`,
        )
        .join("\n");
      return `const ${a.prop.toUpperCase()}: Record<string, string> = {\n${entries}\n};`;
    });
  const booleanConsts = axes
    .filter((a) => a.boolean)
    .map(
      (a) =>
        `const ${a.prop.toUpperCase()} = ${JSON.stringify(
          blockToTailwind(recipe.variants[a.key]?.true ?? {}).join(" "),
        )};`,
    );

  const clsParts = [
    "BASE",
    ...axes.map((a) =>
      a.boolean
        ? `${a.prop} ? ${a.prop.toUpperCase()} : ""`
        : `${a.prop} ? ${a.prop.toUpperCase()}[${a.prop}] : ""`,
    ),
    "className",
  ];
  const destructure = [
    ...axes.map((a) => a.prop),
    "className",
    "...props",
  ].join(", ");

  void voidEl;
  return `${header(slug, name, version, "tailwind")}

import type { ComponentPropsWithoutRef } from "react";

const BASE = ${JSON.stringify(tailwindClassList(recipe))};
${[...variantConsts, ...booleanConsts].join("\n")}

type ${comp}Props = ${propsType(axes, tag)};

export function ${comp}({ ${destructure} }: ${comp}Props) {
  return (
    <${tag}${attrs}
      className={${joinCls(clsParts)}}
      {...props}
    />
  );
}
${Object.entries(recipe.parts ?? {})
  .map(([partName, part]) => {
    const partComp = `${comp}${pascal(partName)}`;
    return `
/** Part "${partName}" of ${comp} - compose it inside <${comp}>. */
export function ${partComp}({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={${joinCls([JSON.stringify(tailwindClassList(part)), "className"])}} {...props} />
  );
}`;
  })
  .join("\n")}`;
}

/** All files for one component, under `<componentsDir>/<name>/`. */
export function generateComponentFiles(
  slug: string,
  name: string,
  recipe: ComponentRecipe,
  css: string,
  version: number,
  styles: "css" | "tailwind",
): GeneratedComponentFile[] {
  const comp = pascal(name);
  const files: GeneratedComponentFile[] = [];
  if (styles === "css") {
    files.push({
      filename: `${name}.tsx`,
      code: `${emitCssMode(slug, name, recipe, version)}\n`,
    });
    files.push({ filename: `${name}.css`, code: `${css}\n` });
  } else {
    files.push({
      filename: `${name}.tsx`,
      code: `${emitTailwindMode(slug, name, recipe, version)}\n`,
    });
  }
  files.push({
    filename: "index.ts",
    code: `export * from "./${name}";\n`,
  });
  void comp;
  return files;
}
