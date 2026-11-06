import type { Ref } from "react";
import type { Category, Group, Scenario, Verdict } from "~~/utils/demo/scenarios";

const ACT: Record<Group, [glyph: string, text: string]> = {
  "Send ETH": ["→", "send eth"],
  "Send token": ["◇", "send token"],
  Approve: ["✓", "approve"],
  Swap: ["⇄", "swap"],
};

const CAT_GLYPH: Record<Category, string> = {
  DRAINER_RECEIVER: "⤓",
  DRAINER_SPENDER: "⤓",
  POISONING_OPERATOR: "≈",
  POISONING_FUNDER: "≋",
  THEFT_PROCEEDS: "$",
  PAID_LOOKALIKE: "≠",
  MALICIOUS_TOKEN: "◇",
  MALICIOUS_DELEGATE: "⇢",
};

const VERDICT_PILL: Record<Verdict, [glyph: string, text: string]> = {
  clean: ["✓", "Pass"],
  warn: ["!", "Warn"],
  block: ["✕", "Block"],
  unverifiable: ["?", "Unverifiable"],
};

export const CatPill = ({ category, hot, struck }: { category: Category; hot?: boolean; struck?: boolean }) => (
  <span className={`p cat${hot ? " hot" : ""}${struck ? " tomb" : ""}`}>
    <i>{CAT_GLYPH[category]}</i>
    {category.toLowerCase().replaceAll("_", " ")}
  </span>
);

type Props = {
  s: Scenario;
  // A button in the grid; the lifted copy in the focus row is not clickable.
  onOpen?: (from: HTMLElement) => void;
  ref?: Ref<HTMLDivElement>;
};

export const ScenarioCard = ({ s, onOpen, ref }: Props) => {
  const tags = [s.tag, s.snapOnly && s.tag !== "snap only" ? "snap only" : undefined].filter(Boolean);
  const retracted = s.flags.length > 0 && s.flags.every(f => f.tombstoned);
  const body = (
    <>
      <div className="t">
        <span>{s.title}</span>
        {tags.length > 0 && <span className="tag">{tags.join(" · ")}</span>}
      </div>
      <div className="d">{s.desc}</div>
      <div className="pills">
        <span className="p act">
          <i>{ACT[s.group][0]}</i>
          {ACT[s.group][1]}
        </span>
        {s.category && <CatPill category={s.category} />}
        {retracted && <span className="p tomb">retracted</span>}
        <span className={`p v ${s.expected}`}>
          <i>{VERDICT_PILL[s.expected][0]}</i>
          {VERDICT_PILL[s.expected][1]}
        </span>
      </div>
    </>
  );
  return onOpen ? (
    <button type="button" className="card" onClick={e => onOpen(e.currentTarget)}>
      {body}
    </button>
  ) : (
    <div className="card" ref={ref}>
      {body}
    </div>
  );
};
