/**
 * Tiny DOM helpers used by the UI. No framework: these build real elements with
 * text nodes (no innerHTML interpolation of user-visible data), which keeps the
 * screens safe and accessible.
 */
import { h } from "../core/utils.js";

export { h };

export function button(label, onClick, opts = {}) {
  const { kind = "", disabled = false, title = null, aria = null, dataset = null } = opts;
  const b = h("button", {
    class: `btn ${kind}`.trim(),
    type: "button",
    disabled,
    title,
    dataset,
    onclick: onClick,
  }, label);
  if (aria) for (const [k, v] of Object.entries(aria)) b.setAttribute(k, v);
  return b;
}

export function panel(title, children, opts = {}) {
  return h("section", { class: `card ${opts.class ?? ""}`.trim() }, [
    title ? h("h3", { class: "card-title" }, typeof title === "string" ? title : title) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function row(title, desc, ...controls) {
  return h("div", { class: "row" }, [
    h("div", { class: "row-main" }, [
      h("div", { class: "row-title" }, title),
      desc ? h("div", { class: "row-desc" }, desc) : null,
    ]),
    h("div", { class: "row-actions" }, controls.filter(Boolean)),
  ]);
}

export function stat(label, value, tone = "") {
  return h("div", { class: "stat" }, [
    h("span", { class: "stat-label" }, label),
    h("span", { class: `stat-value ${tone}`.trim() }, value),
  ]);
}

export function tag(text, tone = "") {
  return h("span", { class: `tag ${tone}`.trim() }, text);
}

export function bar(ratio, color = "", label = null) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  return h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(clamped * 100) }, [
    h("i", { style: { width: `${clamped * 100}%`, background: color || undefined } }),
    label ? h("b", null, label) : null,
  ]);
}

export function tabs(items, active, onSelect) {
  return h(
    "div",
    { class: "tabs", role: "tablist" },
    items.map((item) =>
      h("button", {
        class: `tab ${item.id === active ? "active" : ""}`,
        role: "tab",
        type: "button",
        "aria-selected": item.id === active ? "true" : "false",
        onclick: () => onSelect(item.id),
      }, [item.label, item.count != null ? h("b", null, String(item.count)) : null]),
    ),
  );
}

export function empty(text) {
  return h("p", { class: "empty" }, text);
}

export function icon(glyph, color = "") {
  return h("span", { class: "glyph", style: color ? { color } : null }, glyph);
}

export function spacer() {
  return h("div", { class: "spacer" });
}

export function kv(pairs) {
  return h(
    "dl",
    { class: "kv" },
    pairs.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)]),
  );
}

export function num(n) {
  return Number(n || 0).toLocaleString("en-US");
}
