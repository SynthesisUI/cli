/**
 * Curated INTERACTIVE component templates (dogfood #5-full). `component <name>
 * --interactive` materializes one of these instead of the bare shell, so a
 * generated component behaves like the gallery demo (state + sample content),
 * not an empty `<div className="ds-*">`.
 *
 * Each template is self-contained: it wears the compiled `.ds-<name>*` classes
 * (so it still needs the component's `.css`), and drives behavior with local
 * React state. Motion uses CANONICAL tokens (`--ds-motion-*-standard/base`), so
 * the template is DS-agnostic. Ported from the platform's showcase renderers.
 */

/** Component names that have an interactive/rich template. */
export function hasInteractiveTemplate(name: string): boolean {
  return name in TEMPLATES;
}

/** The `.tsx` source for a component's interactive/rich variant, or null. */
export function interactiveTemplate(name: string): string | null {
  return TEMPLATES[name] ?? null;
}

const JOIN_FIELD = `"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./join-field.css";

const EASE = "var(--ds-motion-easings-standard, cubic-bezier(0.2, 0.7, 0.2, 1))";
const DUR = "var(--ds-motion-durations-base, 300ms)";

/** One layer of the morph, sharing a single grid cell (no layout shift). */
function layer(visible: boolean, fromBelow = true): CSSProperties {
  return {
    gridColumn: 1,
    gridRow: 1,
    transition: \`opacity \${DUR} \${EASE}, transform \${DUR} \${EASE}\`,
    transitionDelay: visible ? "0.18s" : "0s",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : \`translateY(\${fromBelow ? "4px" : "-4px"})\`,
    pointerEvents: visible ? "auto" : "none",
  };
}

/**
 * Join CTA that morphs: pill -> inline email field + Join -> success. The three
 * layers share one grid cell, so the surrounding layout never shifts. Wire the
 * submit to your API where marked.
 */
export function JoinField({ label = "Join the next cohort" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = open || joined;

  useEffect(() => {
    if (!open || joined) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, joined]);

  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div
        className="ds-join-field"
        style={{ display: "inline-grid", alignItems: "center", width: "min(27rem, 100%)" }}
      >
        {/* Collapsed CTA */}
        <button
          type="button"
          className="ds-join-field-trigger"
          aria-hidden={expanded}
          tabIndex={expanded ? -1 : 0}
          onClick={() => setOpen(true)}
          style={{ ...layer(!expanded, false), justifyContent: "center", width: "100%" }}
        >
          <span aria-hidden>✨</span>
          {label}
          <span aria-hidden>→</span>
        </button>

        {/* Email form */}
        <form
          aria-hidden={!open || joined}
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: send inputRef.current?.value to your API, then:
            setJoined(true);
          }}
          style={{ ...layer(open && !joined), display: "flex", alignItems: "stretch", gap: 8 }}
        >
          <span className="ds-join-field-input" style={{ flex: 1, minWidth: 0 }}>
            <span aria-hidden>✉</span>
            <input
              ref={inputRef}
              type="email"
              placeholder="Enter your best e-mail"
              tabIndex={open && !joined ? 0 : -1}
              style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "transparent", color: "inherit", font: "inherit", padding: 0 }}
            />
          </span>
          <button type="submit" className="ds-join-field-submit" tabIndex={open && !joined ? 0 : -1}>
            Join
          </button>
        </form>

        {/* Success (click to reset) */}
        <button
          type="button"
          className="ds-join-field-success"
          aria-hidden={!joined}
          tabIndex={joined ? 0 : -1}
          title="Reset"
          onClick={() => {
            setJoined(false);
            setOpen(false);
          }}
          style={{ ...layer(joined), textAlign: "left", width: "100%" }}
        >
          <span aria-hidden>✓</span>
          <span>
            <strong style={{ display: "block", lineHeight: 1.2 }}>You&apos;re in.</strong>
            <span style={{ opacity: 0.8, fontSize: "0.85em" }}>See you on day one.</span>
          </span>
        </button>
      </div>
    </div>
  );
}
`;

const STREAK = `import "./streak.css";

/** Streak chip - flame + day count. Populated + prop-driven (not an empty shell). */
export function Streak({ days = 12 }: { days?: number }) {
  return (
    <span className="ds-streak">
      <span aria-hidden>🔥</span>
      <span className="ds-streak-count">{days}</span>
      <span className="ds-streak-label">day streak</span>
    </span>
  );
}
`;

const XP_BAR = `import "./xp-bar.css";

/** XP progress bar - the fill grows to \`percent\`. Prop-driven (not an empty shell). */
export function XpBar({ percent = 62 }: { percent?: number }) {
  return (
    <div className="ds-xp-bar">
      <div
        className="ds-xp-bar-fill"
        style={{ width: \`\${Math.max(0, Math.min(100, percent))}%\` }}
      />
    </div>
  );
}
`;

const TEMPLATES: Record<string, string> = {
  "join-field": JOIN_FIELD,
  streak: STREAK,
  "xp-bar": XP_BAR,
};
