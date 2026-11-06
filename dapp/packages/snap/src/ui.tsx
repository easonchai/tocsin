// Every screen in docs/plan/demo/snap-ui.md, built from the Snaps SDK components only.
import type { Verdict, VerifiedList, WriterSync } from "@tocsin/reader";
import {
  Address,
  Banner,
  Box,
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Form,
  Heading,
  Image,
  Input,
  Link,
  Option,
  Row,
  Section,
  Spinner,
  Text,
  type GenericSnapElement,
} from "@metamask/snaps-sdk/jsx";
import type { Address as Addr } from "viem";
import { type Assessment, flagCount } from "./engine";
import { type ListState, LOG_CHAIN_ID, type State } from "./state";

// design/kit/favicon.svg with the baseline in a grey that reads on both MetaMask themes.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><g fill="none" stroke="#e9a23b" stroke-width="2.2" stroke-linecap="square"><path d="M5.60 17.50C8.16 17.50 7.84 14.70 8.03 13.50C8.22 12.30 8.80 9.50 12.00 9.50C15.20 9.50 15.78 12.30 15.97 13.50C16.16 14.70 15.84 17.50 18.40 17.50"/><path d="M2.00 17.50C6.00 17.50 5.50 13.12 5.80 11.25C6.10 9.38 7.00 5.00 12.00 5.00C17.00 5.00 17.90 9.38 18.20 11.25C18.50 13.12 18.00 17.50 22.00 17.50"/></g><path d="M2 18.5h20" stroke="#8a8f98" stroke-width="2.2" stroke-linecap="square"/></svg>`;
const STANDARD = "https://tocsin.eth.limo/erc.html";
const SOURCE = "https://github.com/easonchai/antibody";
const VERSION = "0.0.1";

/** The ERC's category table: name, plain title, and what the subject is. */
const CATEGORY: Record<number, { name: string; title: string; desc: string }> = {
  1: { name: "POISONING_OPERATOR", title: "Poisoning operator", desc: "This account sends transfers that plant lookalike addresses in victims' histories." },
  2: { name: "POISONING_FUNDER", title: "Poisoning funder", desc: "This account funded addresses later used in address poisoning." },
  3: { name: "DRAINER_RECEIVER", title: "Drainer receiver", desc: "This address receives funds forwarded by wallet drainers." },
  4: { name: "MALICIOUS_DELEGATE", title: "Malicious delegate", desc: "This EIP-7702 delegate sweeps the delegating account's assets to a hard-coded address." },
  5: { name: "MALICIOUS_TOKEN", title: "Malicious token", desc: "This token contract emits misleading transfer events." },
  6: { name: "PAID_LOOKALIKE", title: "Paid lookalike", desc: "A victim has already paid this lookalike address." },
  7: { name: "DRAINER_SPENDER", title: "Drainer spender", desc: "This contract has used permits and approvals to drain wallets." },
  8: { name: "THEFT_PROCEEDS", title: "Theft proceeds", desc: "This account holds the proceeds of a theft a writer verified." },
};
const category = (c: number) => CATEGORY[c] ?? { name: `CATEGORY_${c}`, title: `Writer-defined category ${c}`, desc: "A category the writer defines." };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (n: number | bigint) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;
export function ago(at: number, now = Date.now()): string {
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const writerLabel = (state: State, w: Addr) => state.names[w] ?? short(w);
const unique = <T,>(xs: readonly T[]) => [...new Set(xs)];

const RANK: Record<Verdict, number> = { clean: 0, unavailable: 1, warn: 2, block: 3 };
export const worst = (as: readonly Assessment[]): Verdict =>
  as.reduce<Verdict>((v, a) => (RANK[a.evaluation.verdict] > RANK[v] ? a.evaluation.verdict : v), "clean");

/** A sync that started in the last three minutes (the cron's longest run) is still running. */
export const isSyncing = (state: State, now = Date.now()) => state.syncingSince !== undefined && now - state.syncingSince < 180_000;

/** Followed lists the panel applies: pinned and with no pending maintainer change. */
const usable = (l: ListState) => l.followed && l.pinned !== undefined && l.pending === undefined;

export function whyUnavailable(s: WriterSync | undefined): string {
  if (!s) return "not synced yet";
  if (s.status === "synced") return `synced to sequence ${s.seq}`;
  if (s.divergedAt !== undefined) return `chain mismatch at sequence ${s.divergedAt}`;
  // A fresh sync result holds an Error; one read back from Snap state holds its message (state.ts).
  const e = s.error;
  const reason = e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : typeof e === "string" ? e : "";
  return `source failed${reason ? `: ${reason}` : ""}`;
}

const proven = (state: State): string => {
  const sync = state.sync;
  if (!sync) return "nothing proven yet";
  const ws = Object.values(sync.writers);
  return ws.length === 1 ? `head ${short(ws[0]!.head)} · block ${num(sync.block.number)}` : `${plural(ws.length, "writer head")} · block ${num(sync.block.number)}`;
};
const sourceLine = (state: State) => `header and proof from ${host(state.settings.rpcUrl)} · best effort, not a light client`;

const Title = ({ text }: { text: string }) => (
  <Box direction="horizontal" alignment="start">
    <Image src={MARK} alt="Tocsin" />
    <Heading>{text}</Heading>
  </Box>
);

const SyncingRow = ({ state }: { state: State }) =>
  isSyncing(state) ? (
    <Box direction="horizontal" alignment="start">
      <Spinner />
      <Text color="muted">updating…</Text>
    </Box>
  ) : null;

/** Several values stacked under one row label, right-aligned like a single value. */
const Lines = ({ children }: { children: GenericSnapElement[] }) => <Box crossAlignment="end">{children}</Box>;

const Privacy = () => (
  <Text size="sm" color="muted">
    Checked on this device. Nothing was sent to anyone.
  </Text>
);

/** Sync state and the honesty line, under every panel (spec 3.2 step 5). */
const SyncRows = ({ state }: { state: State }) => (
  <Box>
    <Divider />
    <Row label="synced">
      <Text color="muted">
        {state.sync && state.syncedAt
          ? `${num(flagCount(state.sync))} flags · ${plural(Object.keys(state.sync.writers).length, "writer")} · ${ago(state.syncedAt)}`
          : "never"}
      </Text>
    </Row>
    <SyncingRow state={state} />
    <Row label="proven">
      <Text color="muted">{proven(state)}</Text>
    </Row>
    <Row label="source">
      <Text color="muted">{sourceLine(state)}</Text>
    </Row>
    {state.sync && state.status?.error ? (
      <Text color="warning">{`The last sync failed (${state.status.error}); this result uses the sync before it.`}</Text>
    ) : null}
    <Privacy />
  </Box>
);

/** Followed lists left out of this check, and a chain that is not the log's. */
const Notes = ({ state, chainId }: { state: State; chainId: bigint }) => {
  const left = Object.entries(state.lists)
    .filter(([, l]) => l.followed && !usable(l))
    .map(([n, l]) => `${n} (${l.pending ? "its maintainer changed; review it in Tocsin" : "no verified list yet"})`);
  return (
    <Box>
      {left.length > 0 ? <Text color="warning">{`Not checked: ${left.join(", ")}.`}</Text> : null}
      {chainId !== LOG_CHAIN_ID ? (
        <Text color="warning">{`This request is on chain ${chainId}, not Sepolia. Only flags written for chain ${chainId} or for every chain count here.`}</Text>
      ) : null}
    </Box>
  );
};

type Cause = { title: string; body: string };

function causeOf(state: State, assessments: Assessment[] | undefined): Cause {
  const last = state.lastGood ? `Last good sync ${ago(state.lastGood.at)} at block ${num(state.lastGood.block)}.` : "No good sync yet.";
  const rpc = host(state.settings.rpcUrl);
  if (!state.sync) {
    if (isSyncing(state)) {
      const n = Object.values(state.lists).filter((l) => l.followed).length;
      return { title: "First sync in progress", body: `Downloading flags for ${plural(n, "list")}. Usually under a minute.` };
    }
    return { title: "Tocsin has not synced yet", body: `${state.status?.error ? `${state.status.error}. ` : ""}Open Tocsin from the Snaps menu and press Sync now.` };
  }
  if (!assessments) return { title: "No list to check against", body: "Follow a list on the Tocsin page in the Snaps menu." };
  const sync = state.sync;
  const ws = unique(assessments.flatMap((a) => a.evaluation.unavailable)).map((w) => sync.writers[w]);
  if (ws.some((w) => w?.status === "unavailable" && w.divergedAt !== undefined)) {
    return {
      title: "The RPC's data does not match Ethereum",
      body: `Replayed the flags from ${rpc} and they did not reach the head proven at block ${num(sync.block.number)}. One or more flags are missing or altered. Switch RPC in Tocsin settings.`,
    };
  }
  const failed = ws.find((w) => w?.status === "unavailable");
  if (failed) return { title: `Could not reach ${rpc}`, body: `${whyUnavailable(failed)}. ${last}` };
  return { title: "Not every writer synced", body: last };
}

/** Spec 3.5. The lying-RPC beat lands here: blue, never green, never red. */
function Unverifiable({ state, assessments, chainId, retry }: { state: State; assessments: Assessment[] | undefined; chainId: bigint; retry: boolean }) {
  const c = causeOf(state, assessments);
  const lg = state.lastGood;
  const diverged = Object.values(state.sync?.writers ?? {}).filter((w) => w.status === "unavailable" && w.divergedAt !== undefined);
  return (
    <Box>
      <Title text="Unverifiable" />
      <Text color="warning">Tocsin could not verify the flag log. Treat this address as unchecked.</Text>
      <Banner severity="info" title={c.title}>
        <Text>{c.body}</Text>
      </Banner>
      <Notes state={state} chainId={chainId} />
      <Divider />
      <Row label="last good">
        <Text color="muted">{lg ? `${num(lg.flags)} flags · ${ago(lg.at)}` : "never"}</Text>
      </Row>
      <Row label="proven">
        <Text color="muted">{proven(state)}</Text>
      </Row>
      {diverged.map((w) => (
        <Row label="replayed" variant="critical">
          <Text>{`${writerLabel(state, w.writer)} · ${whyUnavailable(w)}`}</Text>
        </Row>
      ))}
      <Row label="source">
        <Text color="muted">{sourceLine(state)}</Text>
      </Row>
      <SyncingRow state={state} />
      {retry ? (
        <Button name="retry" disabled={isSyncing(state)}>
          Retry sync
        </Button>
      ) : null}
      <Privacy />
    </Box>
  );
}

/** One flagged address: why, who flagged it, and the evidence (spec 3.2 steps 2 and 3). */
function Flag({ state, a }: { state: State; a: Assessment }) {
  const { evaluation: e, target } = a;
  const block = e.verdict === "block";
  const cats = unique(e.findings.map((f) => f.category)).map(category);
  const writers = unique(e.findings.map((f) => f.writer));
  const lists = unique(a.listOf.filter(Boolean));
  const { threshold, warnOnly } = state.policy;
  const why = block
    ? ""
    : e.findings.every((f) => f.category === 8) && target.context === "recipient"
      ? " Theft proceeds are a warning by policy; this category is meant for exchanges and bridges, not send screens."
      : e.findings.every((f) => warnOnly.includes(f.category))
        ? ` Your policy makes ${cats.map((c) => c.name).join(", ")} warn only.`
        : threshold === 1
          ? " The flag is countered by an independent writer or comes from a weight-0 entry."
          : " Your policy blocks only on a weight-255 writer or two independent writers.";
  const flaggedBy = unique(e.findings.map((f) => writerLabel(state, f.writer)));
  const evidence = unique(e.findings.map((f) => f.evidence));
  const seen = e.findings.reduce((m, f) => (f.leaf.leaf.seenBlock < m ? f.leaf.leaf.seenBlock : m), e.findings[0]!.leaf.leaf.seenBlock);
  const head = state.sync?.block.number;
  const seenAgo = head !== undefined && seen <= head ? ` · ${ago(0, Number(head - seen) * 12_000)}` : "";
  return (
    <Box>
      <Banner severity={block ? "danger" : "warning"} title={cats[0]!.title}>
        <Text>{`${cats[0]!.desc} Flagged by ${plural(writers.length, "writer")} on ${lists.join(", ")}.${why}`}</Text>
      </Banner>
      <Section>
        <Row label="address">
          <Address address={target.address} />
        </Row>
        <Row label="role">
          <Text>{target.why}</Text>
        </Row>
        <Row label="category" tooltip={cats.map((c) => `${c.name}: ${c.desc}`).join(" ")}>
          <Text>{cats.map((c) => c.name).join(", ")}</Text>
        </Row>
        <Row label="flagged by">
          <Lines>
            {flaggedBy.map((t) => (
              <Text>{t}</Text>
            ))}
          </Lines>
        </Row>
        <Row label="evidence" tooltip="A transaction hash or the hash of an off-chain evidence bundle. If the explorer finds no transaction, it is a bundle hash.">
          <Lines>
            {evidence.map((h) => (
              <Link href={`https://sepolia.etherscan.io/tx/${h}`}>{short(h)}</Link>
            ))}
          </Lines>
        </Row>
        <Row label="seen">
          <Text>{`block ${num(seen)}${seenAgo}`}</Text>
        </Row>
        {e.unavailable.map((w) => (
          <Row label={writerLabel(state, w)} variant="warning">
            <Text>{whyUnavailable(state.sync?.writers[w])}</Text>
          </Row>
        ))}
      </Section>
    </Box>
  );
}

export type PanelProps = {
  state: State;
  /** Undefined when there is no sync or no usable list yet. */
  assessments: Assessment[] | undefined;
  chainId: bigint;
  signing?: boolean;
};

/** The insight panel for one transaction or signature (spec sections 3 and 4). */
export function Panel({ state, assessments, chainId, signing = false }: PanelProps) {
  const verdict = assessments ? worst(assessments) : "unavailable";
  if (!assessments || verdict === "unavailable") return <Unverifiable state={state} assessments={assessments} chainId={chainId} retry={!signing} />;
  if (assessments.length === 0) {
    return (
      <Box>
        <Text>No address in this request to check.</Text>
        <SyncRows state={state} />
      </Box>
    );
  }
  if (verdict === "clean") {
    const lists = Object.entries(state.lists).filter(([, l]) => usable(l)).map(([n]) => n);
    return (
      <Box>
        <Title text="No flags" />
        <Banner severity="success" title="Not on any list you follow">
          <Text>{`Checked against ${plural(lists.length, "list")}, ${num(state.sync ? flagCount(state.sync) : 0)} flags, synced ${state.syncedAt ? ago(state.syncedAt) : "never"}.`}</Text>
        </Banner>
        <Notes state={state} chainId={chainId} />
        <Section>
          <Row label="checked">
            <Lines>
              {assessments.map((a) => (
                <Text>{`${a.target.why} ${short(a.target.address)}`}</Text>
              ))}
            </Lines>
          </Row>
          <Row label="lists">
            <Text>{lists.join(", ")}</Text>
          </Row>
        </Section>
        <SyncRows state={state} />
      </Box>
    );
  }
  const block = verdict === "block";
  const flagged = assessments.filter((a) => a.evaluation.findings.length > 0).sort((x, y) => RANK[y.evaluation.verdict] - RANK[x.evaluation.verdict]);
  return (
    <Box>
      <Title text={block ? "Blocked" : "Warning"} />
      <Text color={block ? "error" : "warning"}>{block ? `Reject this ${signing ? "signature" : "transaction"}.` : "Check this address before you continue."}</Text>
      <Notes state={state} chainId={chainId} />
      {flagged.map((a) => (
        <Flag state={state} a={a} />
      ))}
      <SyncRows state={state} />
    </Box>
  );
}

/** A list's pin and pending change, verified for display. */
export type ListView = { name: string; state: ListState; pinned?: VerifiedList | undefined; pending?: VerifiedList | undefined };
export type HomeErrors = { rpcUrl?: string; listName?: string };

const describe = (l: VerifiedList | undefined) =>
  l && "entries" in l.list ? `maintainer ${short(l.maintainer)} · ${plural(l.list.entries.length, "writer")} · version ${l.version}` : "not pinned yet";

// acceptList reports "stale" when the record or document could not be fetched; the pin still applies.
const listStatus = (s: string) => (s === "stale" ? "Could not fetch the latest list. Using the pinned copy." : `Last check: ${s}`);

function ListCard({ v }: { v: ListView }) {
  const { name, state: l, pinned, pending } = v;
  return (
    <Section>
      <Text fontWeight="bold">{name}</Text>
      <Text size="sm" color="muted">
        {describe(pinned)}
      </Text>
      {pending ? (
        <Banner severity="warning" title="Maintainer changed">
          <Text>{`Was ${pinned ? short(pinned.maintainer) : "unknown"}, now ${short(pending.maintainer)}. Excluded until you review.`}</Text>
        </Banner>
      ) : null}
      {l.status && l.status !== "accepted" && !pending ? (
        <Text size="sm" color="warning">
          {listStatus(l.status)}
        </Text>
      ) : null}
      <Toggle name={`follow:${name}`} label="Follow this list" checked={l.followed} />
      <Box direction="horizontal" alignment={pending ? "space-between" : "end"}>
        {pending ? <Button name={`review:${name}`}>Review</Button> : null}
        <Button name={`remove:${name}`} variant="destructive">
          Remove
        </Button>
      </Box>
    </Section>
  );
}

/** A home page section title, small caps in muted grey as in the mock. */
const SectionTitle = ({ text }: { text: string }) => <Text color="muted">{text.toUpperCase()}</Text>;
const RightButton = ({ name, label, disabled = false, submit = false }: { name: string; label: string; disabled?: boolean; submit?: boolean }) => (
  <Box direction="horizontal" alignment="end">
    <Button name={name} disabled={disabled} {...(submit && { type: "submit" as const })}>
      {label}
    </Button>
  </Box>
);

/** Categories the Policy section offers as warn-only (snap-ui spec 5.3). */
const WARN_ONLY_CHOICES = [2, 8];

const Toggle = ({ name, label, checked }: { name: string; label: string; checked: boolean }) => (
  <Box direction="horizontal" alignment="space-between">
    <Text>{label}</Text>
    <Checkbox name={name} checked={checked} variant="toggle" />
  </Box>
);

/** The home page, which is also the settings page (spec section 5). */
export function HomePage({ state, lists, errors = {} }: { state: State; lists: ListView[]; errors?: HomeErrors }) {
  const sync = state.sync;
  const syncing = isSyncing(state);
  const failing = Object.values(sync?.writers ?? {}).filter((w) => w.status !== "synced");
  return (
    <Box>
      <SectionTitle text="Status" />
      <Row label="flags">
        <Text>{sync ? `${num(flagCount(sync))} across ${plural(Object.keys(sync.writers).length, "writer")}` : "none yet"}</Text>
      </Row>
      <Row label="proven head">
        <Text>{proven(state)}</Text>
      </Row>
      <Row label="last sync">
        <Text>{state.syncedAt ? ago(state.syncedAt) : "never"}</Text>
      </Row>
      <Row label="source">
        <Text color="muted">{`${host(state.settings.rpcUrl)} · best effort, not a light client`}</Text>
      </Row>
      {failing.map((w) => (
        <Row label={writerLabel(state, w.writer)} variant="warning">
          <Text>{whyUnavailable(w)}</Text>
        </Row>
      ))}
      {syncing ? (
        <Box direction="horizontal" alignment="start">
          <Spinner />
          <Text>Syncing…</Text>
        </Box>
      ) : null}
      {state.status?.error ? (
        <Banner severity="warning" title="Last sync failed">
          <Text>{state.status.error}</Text>
        </Banner>
      ) : null}
      <RightButton name="sync" label="Sync now" disabled={syncing} />

      <SectionTitle text="Lists" />
      {lists.length === 0 ? <Text>No lists yet. Add one below.</Text> : null}
      {lists.map((v) => (
        <ListCard v={v} />
      ))}
      <Form name="add">
        <Field label="Add a list by ENS name" {...(errors.listName && { error: errors.listName })}>
          <Input name="listName" type="text" placeholder="name.tocsin.eth" />
        </Field>
        <RightButton name="add" label="Add" submit />
      </Form>

      <SectionTitle text="Policy" />
      <Field label="Block when flagged by">
        <Dropdown name="threshold" value={`${state.policy.threshold}`}>
          <Option value="1">1 writer</Option>
          <Option value="2">2 independent writers</Option>
        </Dropdown>
      </Field>
      {WARN_ONLY_CHOICES.map((c) => (
        <Toggle name={`warnOnly:${c}`} label={`${category(c).name} · warn only`} checked={state.policy.warnOnly.includes(c)} />
      ))}
      <Toggle name="checkApprovals" label="Check approvals, permits and 7702 delegates" checked={state.policy.checkApprovals} />
      <Text size="sm" color="muted">A weight-255 writer on a list you follow blocks on its own, except in a warn-only category.</Text>

      <SectionTitle text="Network" />
      <Form name="network">
        <Field label="RPC URL" {...(errors.rpcUrl && { error: errors.rpcUrl })}>
          <Input name="rpcUrl" type="text" value={state.settings.rpcUrl} />
        </Field>
        <RightButton name="saveRpc" label="Save and sync" disabled={syncing} submit />
      </Form>
      <Text color="muted">
        This Snap cannot run a light client or route through anon-rpc. The RPC you pick here can see which flags you download, never which address you check. Use Kohaku for full verification.
      </Text>

      <SectionTitle text="About" />
      <Text color="muted">Tocsin is an open, append-only log of scam infrastructure on Ethereum. Flags come from writers on lists you choose. Nothing is ever removed.</Text>
      <Box direction="horizontal" alignment="space-between">
        <Link href={STANDARD}>Read the standard</Link>
        <Link href={SOURCE}>Source</Link>
      </Box>
      <Text size="sm" color="muted">{`v${VERSION} · Sepolia`}</Text>
    </Box>
  );
}

/** snap_dialog confirmation before pinning a list the user added. */
export const AddListDialog = ({ name, list }: { name: string; list: VerifiedList }) => (
  <Box>
    <Heading>{`Pin ${name}?`}</Heading>
    <Row label="maintainer">
      <Address address={list.maintainer} />
    </Row>
    <Row label="writers">
      <Text>{"entries" in list.list ? `${list.list.entries.length}` : "0"}</Text>
    </Row>
    <Row label="version">
      <Text>{`${list.version}`}</Text>
    </Row>
    <Text>Tocsin pins this maintainer. A list signed by anyone else is held for your review and not used until you accept it.</Text>
  </Box>
);

/** snap_dialog confirmation for a changed list maintainer, opened from Review. */
export const MaintainerDialog = ({ name, current, candidate }: { name: string; current: VerifiedList | undefined; candidate: VerifiedList }) => (
  <Box>
    <Heading>List maintainer changed</Heading>
    <Text>{`The list at ${name} is now signed by a different maintainer. It stays excluded unless you accept.`}</Text>
    {current ? (
      <Row label="Pinned maintainer">
        <Address address={current.maintainer} />
      </Row>
    ) : null}
    {current ? (
      <Row label="Pinned version">
        <Text>{`${current.version}`}</Text>
      </Row>
    ) : null}
    <Row label="New maintainer" variant="warning">
      <Address address={candidate.maintainer} />
    </Row>
    <Row label="New version">
      <Text>{`${candidate.version}`}</Text>
    </Row>
    <Text>Accept only if you know why the maintainer changed. A stolen name can point at a list signed by anyone.</Text>
  </Box>
);

/** The alert after the first sync (spec section 6). */
export function InstallDialog({ state }: { state: State }) {
  const ok = state.sync && !state.status?.error;
  const n = Object.values(state.lists).filter(usable).length;
  return (
    <Box>
      <Title text="Tocsin is on" />
      <Text>
        {ok
          ? `Every transaction and permit is now checked against ${plural(n, "list")}, ${num(flagCount(state.sync!))} flags, on this device.`
          : `First sync failed: ${state.status?.error ?? "unknown error"}. Tocsin will retry in the background and show "unverifiable" until then.`}
      </Text>
      <Text color="muted">Open Tocsin from the Snaps menu to change lists or the RPC.</Text>
    </Box>
  );
}
