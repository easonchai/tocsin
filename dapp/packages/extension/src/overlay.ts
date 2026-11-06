// The overlay: a closed shadow root over the page, the extension's only output. Text goes in with
// textContent, never innerHTML, since writer names come from ENS and the list.
import { type Plan, type Report, plan } from "./report.ts";

const FRAMING = "The chain proves each flag is the writer's own entry, complete and in order. Whether the writer is right is your pinned list speaking.";

const CSS = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
  background: rgb(0 0 0 / 0.55); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.dialog { --bg: #fff; --fg: #1a1a1a; --muted: #5c5c5c; --line: #e2e2e2; --danger: #b42318; --warning: #9a6700; --btn: #f2f2f2;
  box-sizing: border-box; width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--bg); color: var(--fg);
  border-radius: 12px; padding: 20px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.35); border-top: 6px solid var(--tone); }
@media (prefers-color-scheme: dark) { .dialog { --bg: #1d1d1f; --fg: #f2f2f2; --muted: #a8a8a8; --line: #3a3a3c; --danger: #ff7b72; --warning: #e3b341; --btn: #2c2c2e; } }
.danger { --tone: var(--danger); } .warning { --tone: var(--warning); }
h2 { margin: 0 0 4px; font-size: 18px; color: var(--tone); }
p { margin: 0 0 12px; }
.small { font-size: 12px; color: var(--muted); }
.item { border-top: 1px solid var(--line); padding: 10px 0; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 6px 0 0; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
code { font: 12px ui-monospace, monospace; overflow-wrap: anywhere; }
a { color: inherit; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 16px; }
button { font: inherit; min-height: 40px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--btn); color: var(--fg); cursor: pointer; }
button.primary { background: var(--tone); border-color: var(--tone); color: var(--bg); font-weight: 600; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button:focus-visible { outline: 3px solid var(--tone); outline-offset: 2px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function row(dl: HTMLDListElement, label: string, value: Node | string): void {
  const dd = el("dd");
  dd.append(value);
  dl.append(el("dt", label), dd);
}

function body(r: Report, p: Extract<Plan, { show: true }>): HTMLElement[] {
  const out: HTMLElement[] = [el("p", p.body)];
  for (const item of r.items) {
    if (item.findings.length === 0 && item.verdict === "clean") continue;
    const box = el("div", undefined, "item");
    const head = el("p");
    head.append(`${item.why}: `, el("code", item.address));
    box.append(head);
    for (const f of item.findings) {
      const dl = el("dl");
      row(dl, "Writer", f.writer);
      row(dl, "Category", f.category);
      const link = el("a", `${f.evidence.slice(0, 10)}...${f.evidence.slice(-6)}`);
      link.href = `https://sepolia.etherscan.io/tx/${f.evidence}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row(dl, "Evidence", link);
      box.append(dl);
    }
    out.push(box);
  }
  if (r.unavailable.length) {
    const box = el("div", undefined, "item");
    box.append(el("p", "Writers Tocsin could not verify:"));
    const dl = el("dl");
    for (const u of r.unavailable) row(dl, u.writer, u.why);
    box.append(dl);
    out.push(box);
  }
  out.push(el("p", r.trust, "small"), el("p", FRAMING, "small"));
  return out;
}

/** Shows the overlay for a report and resolves true to continue to the wallet. A clean report resolves at once. */
export function showOverlay(r: Report): Promise<boolean> {
  const p = plan(r);
  if (!p.show) return Promise.resolve(true);
  return new Promise((resolve) => {
    const host = el("div");
    const root = host.attachShadow({ mode: "closed" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS); // a constructed sheet is not subject to the page's style-src CSP
    root.adoptedStyleSheets = [sheet];

    const backdrop = el("div", undefined, "backdrop");
    const dialog = el("div", undefined, `dialog ${p.tone}`);
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "tocsin-title");
    const title = el("h2", p.title);
    title.id = "tocsin-title";
    dialog.append(el("p", "Tocsin held this request before your wallet opened.", "small"), title, ...body(r, p));

    const cancel = el("button", p.cancelLabel);
    const proceed = el("button", p.proceedLabel);
    // Block: stopping is the primary action and the override waits. Otherwise continuing is primary.
    (p.overrideDelayMs > 0 ? cancel : proceed).className = "primary";
    const actions = el("div", undefined, "actions");
    actions.append(proceed, cancel);
    dialog.append(actions);

    let timer: ReturnType<typeof setInterval> | undefined;
    const done = (go: boolean) => {
      clearInterval(timer);
      host.remove();
      resolve(go);
    };
    cancel.addEventListener("click", () => done(false));
    proceed.addEventListener("click", () => done(true));
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") done(false);
      if (e.key === "Tab") {
        // Two buttons: keep focus inside the dialog.
        e.preventDefault();
        (root.activeElement === cancel && !proceed.disabled ? proceed : cancel).focus();
      }
    });

    if (p.overrideDelayMs > 0) {
      let left = Math.ceil(p.overrideDelayMs / 1000);
      proceed.disabled = true;
      proceed.textContent = `${p.proceedLabel} (${left}s)`;
      timer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          proceed.textContent = `${p.proceedLabel} (${left}s)`;
          return;
        }
        clearInterval(timer);
        proceed.disabled = false;
        proceed.textContent = p.proceedLabel;
      }, 1000);
    }

    backdrop.append(dialog);
    root.append(backdrop);
    document.documentElement.append(host);
    (p.overrideDelayMs > 0 ? cancel : proceed).focus();
  });
}
