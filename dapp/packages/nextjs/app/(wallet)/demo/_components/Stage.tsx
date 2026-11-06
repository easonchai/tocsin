"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CatPill } from "./ScenarioCard";
import type { Address } from "viem";
import type { Scene } from "~~/utils/demo/explain";
import { type Context, LISTS, type Scenario, type WriterId } from "~~/utils/demo/scenarios";
import { drawnFlags } from "~~/utils/demo/timeline";

const CTX: Record<Context, string> = {
  recipient: "recipient of your send",
  spender: "spender of your allowance",
  token: "the token contract you call",
};
const VERDICT_WORD = { clean: "Clean", warn: "Warn", block: "Blocked", unverifiable: "Unverifiable" } as const;
const HEAD = "0x8f3a…c41e";
const LYING_HEAD = "0x17d2…90b3";
// The lying proxy drops core's leaf at sequence 93.
const SEQ = [90, 91, 92, 93, 94, 95, 96];
const MISSING = 93;

const cls = (base: string, on: boolean) => (on ? `${base} on` : base);

// Position inside the stage from the offset chain, so the 12 px entrance rise does not skew the wires.
const offsetIn = (el: HTMLElement, root: HTMLElement) => {
  let x = 0;
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y };
};

type Props = {
  s: Scenario;
  scene: Scene;
  on: (key: string) => boolean;
  connected?: Address;
  onSkip: () => void;
};

export const Stage = ({ s, scene, on, connected, onSkip }: Props) => {
  const stage = useRef<HTMLElement>(null);
  const subject = useRef<HTMLDivElement>(null);
  const pills = useRef<Partial<Record<WriterId, HTMLElement | null>>>({});
  const [paths, setPaths] = useState<Partial<Record<WriterId, string>>>({});
  const flags = drawnFlags(s, scene);
  const flagKey = flags.map(f => f.writer).join();

  // Wires run from the list card's right edge, level with the writer pill, to the subject's left edge.
  useLayoutEffect(() => {
    const root = stage.current;
    const sub = subject.current;
    if (!root || !sub) return;
    const measure = () => {
      const b = offsetIn(sub, root);
      const x2 = b.x;
      const y2 = b.y + sub.offsetHeight / 2;
      const next: Partial<Record<WriterId, string>> = {};
      for (const id of flagKey.split(",").filter(Boolean) as WriterId[]) {
        const pill = pills.current[id];
        const card = pill?.closest<HTMLElement>(".lcard");
        if (!pill || !card) continue;
        const x1 = offsetIn(card, root).x + card.offsetWidth;
        const y1 = offsetIn(pill, root).y + pill.offsetHeight / 2;
        const c = Math.max(28, (x2 - x1) / 2);
        next[id] = `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`;
      }
      setPaths(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [flagKey]);

  const red = scene.verdict === "block" && on("verdict");
  const poison = Boolean(s.poison);
  const subjectLabel =
    s.subject === "connected"
      ? s.subjectLabel
      : scene.context === "token"
        ? `${s.subjectLabel}, the contract itself`
        : s.subjectLabel;
  const subjectAddr = s.subject === "connected" ? (connected ?? "the account you connect") : s.subject;
  const proof = (k: number) => on(`proof${k}`);

  return (
    // Clicking anywhere on the stage jumps to the final frame; the page also binds Enter to it.
    <main
      className="stage"
      ref={stage}
      aria-live="polite"
      onClick={e => !(e.target as Element).closest("a, button") && onSkip()}
    >
      <svg className="wires" aria-hidden="true">
        {flags.map(f => {
          const d = paths[f.writer];
          if (!d) return null;
          const drawn = on(`w:${f.writer}`);
          const struck = on(`x:${f.writer}`);
          const heavy = LISTS.some(l => l.writers.some(w => w.id === f.writer && w.weight === 255));
          return (
            <g key={f.writer}>
              <path
                id={`wire-${f.writer}`}
                d={d}
                className={`wire${heavy ? " heavy" : ""}${drawn ? " drawn" : ""}${struck ? " struck" : ""}`}
              />
              {drawn && !struck && (
                <circle r="3.5" className={`mote${red ? " bad" : ""}`}>
                  <animateMotion dur="1.6s" repeatCount="indefinite" begin="0.45s">
                    <mpath href={`#wire-${f.writer}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      <section className="col" aria-label="The lists the wallet follows">
        {scene.lists.map((o, k) => (
          <div key={o.list.name} className={cls("lcard in", on(`list${k}`))}>
            <div className="name">
              <span>{o.list.name}</span>
              <small>{o.list.role}</small>
            </div>
            <div className="writers">
              {o.list.writers.map((w, j) => {
                const lied = poison && k === 0 && j === 0;
                const flag = flags.find(f => f.writer === w.id);
                return (
                  <div className="writer" key={w.id}>
                    <span
                      className="pill"
                      ref={el => {
                        pills.current[w.id] = el;
                      }}
                    >
                      {w.label}
                      <span className="w">w{w.weight}</span>
                    </span>
                    {lied && (
                      <span className={cls("says pills", on("gap"))}>
                        <span className="p cat hot">
                          <i>?</i>entry {MISSING} missing
                        </span>
                      </span>
                    )}
                    {flag && s.category && (
                      <span className={cls("says pills", on(`w:${w.id}`))}>
                        <CatPill category={s.category} struck={on(`x:${w.id}`)} />
                        {on(`x:${w.id}`) && (
                          <span className="p">
                            <i>⌫</i>then retracted it
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {poison && k === 0 && (
              <div className={cls("seq says", on("seq"))} aria-label={`sequence ${MISSING} missing`}>
                {SEQ.map(n => (
                  <span key={n} className={n === MISSING && on("gap") ? "gap" : undefined}>
                    {n === MISSING ? "?" : n}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="col mid" aria-label="The subject and the verdict">
        {s.via && (
          <>
            <div className={cls("ctx in", on("mid"))}>the contract you call</div>
            <div className={cls("subject second in", on("mid"))}>
              <div className="lab">{s.via.label}</div>
              <div className="addr">{s.via.address}</div>
              {s.tx.kind === "swap" && <div className="foot">the decoder reads through the swap to its recipient</div>}
            </div>
          </>
        )}
        <div className={cls("ctx in", on("mid"))}>{CTX[scene.context]}</div>
        <div ref={subject} className={`${cls("subject in", on("mid"))}${red ? " bad" : ""}`}>
          <div className="lab">{subjectLabel}</div>
          <div className="addr">{subjectAddr}</div>
          {s.category && (
            <div className="pills">
              <CatPill category={s.category} hot={red} />
            </div>
          )}
        </div>
        {!poison && scene.flaggedLists > 0 && (
          <div className={cls("count in", on("count"))}>
            <b>{scene.independent}</b> independent writer{scene.independent === 1 ? "" : "s"}
            <span className="sep">·</span>
            <b>{scene.flaggedLists}</b>/{LISTS.length} lists
            {scene.collapsed && (
              <>
                <span className="sep">·</span> core + detector count once
              </>
            )}
          </div>
        )}
        <div className={cls("rule in", on("rule"))}>{scene.rule}</div>
        <div className={`${cls("verdict in", on("verdict"))} ${scene.verdict}`}>
          {VERDICT_WORD[scene.verdict]}
          <span className={on("verdict") && scene.verdict !== "clean" ? "ring go" : "ring"} />
        </div>
      </section>

      <section className="col proof" aria-label="How the wallet knows">
        <div className={cls("ctx in", proof(0))}>how the wallet knows</div>
        <div className={cls("node hero in", proof(1))}>
          <span className="ic">⛓</span>
          <div>
            <div className="k">block header · finalized</div>
            <div className="v">light client, not an RPC</div>
          </div>
        </div>
        <div className={cls("link", proof(2))}>
          <span className="dot" />
        </div>
        <div className={cls("node in", proof(3))}>
          <span className="ic">#</span>
          <div>
            <div className="k">proven head, core.tocsin.eth</div>
            <div className="v">{HEAD}</div>
          </div>
        </div>
        <div className={cls("link", proof(4))}>
          <span className="dot" />
        </div>
        <div className={cls("node in", proof(5))}>
          <span className="ic">↓</span>
          <div>
            <div className="k">events from the RPC</div>
            <div className="v">
              {SEQ.map((n, i) => (
                <span key={n} className={poison && n === MISSING ? "gap" : undefined}>
                  {i ? " " : ""}
                  {poison && n === MISSING ? "?" : n}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={`${cls("link", proof(6))}${poison && proof(6) ? " stop bad" : ""}`}>
          <span className="dot" />
        </div>
        <div className={`${cls("node in", proof(7))}${poison ? " bad" : ""}`}>
          <span className="ic">⟳</span>
          <div>
            <div className="k">replayed head · keccak(head, flag)</div>
            <div className="v">{poison ? LYING_HEAD : HEAD}</div>
          </div>
        </div>
        <div className={`${cls("compare in", proof(8))}${poison ? " bad" : ""}`}>
          <span className="mark">{poison ? "✕" : "="}</span>
          <span>{poison ? "mismatch" : "match"}</span>
        </div>
      </section>
      <span className="hint">← → scenario · R replay · click stage to skip · Enter send · P presenter · Esc back</span>
    </main>
  );
};
