import {
  type ComponentOrElement,
  type OnCronjobHandler,
  type OnHomePageHandler,
  type OnInstallHandler,
  type OnSettingsPageHandler,
  type OnSignatureHandler,
  type OnTransactionHandler,
  type OnUserInputHandler,
  UserInputEventType,
} from "@metamask/snaps-sdk";
import { type Target, signatureTargets, transactionTargets } from "./decode";
import { assess, clearCheckpoints, fetchCandidate, runSync, verifiedPin } from "./engine";
import { parseListName, parseRpcUrl } from "./settings";
import { LOG_CHAIN_ID, type State, loadState, saveState } from "./state";
import { AddListDialog, type HomeErrors, HomePage, InstallDialog, MaintainerDialog, Panel, worst } from "./ui";

/** What onUserInput needs to redraw a transaction panel after Retry sync. */
type PanelContext = { kind: "panel"; targets: Target[]; chainId: string };

const confirm = async (content: ComponentOrElement) =>
  (await snap.request({ method: "snap_dialog", params: { type: "confirmation", content } })) === true;

// shortcut: a cron tick and a user sync can overlap and the later save wins; add a lock if that shows up.
/** Marks the sync as running (panels show "updating…"), runs it, and saves the result. */
async function syncAndSave(from?: State): Promise<State> {
  const start = { ...(from ?? (await loadState())), syncingSince: Date.now() };
  await saveState(start);
  const { syncingSince: _, ...next } = await runSync(start);
  await saveState(next);
  return next;
}

export const onInstall: OnInstallHandler = async () => {
  const state = await syncAndSave();
  await snap.request({ method: "snap_dialog", params: { type: "alert", content: <InstallDialog state={state} /> } });
};

export const onCronjob: OnCronjobHandler = async ({ request }) => {
  if (request.method === "sync") await syncAndSave();
};

const chainOf = (caip: string): bigint => {
  const id = /^eip155:(\d+)$/.exec(caip)?.[1];
  return id ? BigInt(id) : LOG_CHAIN_ID;
};

export const onTransaction: OnTransactionHandler = async ({ transaction, chainId }) => {
  const state = await loadState();
  const chain = chainOf(chainId);
  const targets = transactionTargets(transaction);
  const assessments = await assess(state, targets, chain);
  const context: PanelContext = { kind: "panel", targets, chainId: `${chain}` };
  const id = await snap.request({
    method: "snap_createInterface",
    params: { ui: <Panel state={state} assessments={assessments} chainId={chain} />, context },
  });
  return { id, ...(assessments && worst(assessments) === "block" && { severity: "critical" as const }) };
};

// MetaMask shows signature insight only at critical severity, so a permit gets a panel only when flagged.
export const onSignature: OnSignatureHandler = async ({ signature }) => {
  if (signature.signatureMethod !== "eth_signTypedData_v3" && signature.signatureMethod !== "eth_signTypedData_v4") return null;
  const { targets, chainId } = signatureTargets(signature.data);
  if (targets.length === 0) return null;
  const state = await loadState();
  const chain = chainId ?? LOG_CHAIN_ID;
  const assessments = await assess(state, targets, chain);
  const verdict = assessments ? worst(assessments) : "unavailable";
  if (verdict !== "block" && verdict !== "warn") return null;
  return { content: <Panel state={state} assessments={assessments} chainId={chain} signing />, severity: "critical" };
};

async function homeUi(state: State, errors?: HomeErrors) {
  const lists = await Promise.all(
    Object.entries(state.lists).map(async ([name, l]) => ({ name, state: l, pinned: await verifiedPin(l.pinned), pending: await verifiedPin(l.pending) })),
  );
  return <HomePage state={state} lists={lists} {...(errors && { errors })} />;
}

export const onHomePage: OnHomePageHandler = async () => {
  const id = await snap.request({ method: "snap_createInterface", params: { ui: await homeUi(await loadState()), context: { kind: "home" } } });
  return { id };
};

// The same page, for a MetaMask that opens Snap settings instead of the home page.
export const onSettingsPage: OnSettingsPageHandler = onHomePage;

export const onUserInput: OnUserInputHandler = async ({ id, event, context }) => {
  const show = async (ui: ComponentOrElement) => snap.request({ method: "snap_updateInterface", params: { id, ui } });
  const name = event.name ?? "";

  if (context?.kind === "panel") {
    if (event.type !== UserInputEventType.ButtonClickEvent || name !== "retry") return;
    // SAFETY: onTransaction is the only writer of a "panel" context.
    const { targets, chainId } = context as PanelContext;
    const chain = BigInt(chainId);
    const draw = async (s: State) => show(<Panel state={s} assessments={await assess(s, targets, chain)} chainId={chain} />);
    const state = await loadState();
    await draw({ ...state, syncingSince: Date.now() });
    await draw(await syncAndSave(state));
    return;
  }

  const home = async (s: State, errors?: HomeErrors) => show(await homeUi(s, errors));
  const resync = async (s: State) => {
    await home({ ...s, syncingSince: Date.now() });
    await home(await syncAndSave(s));
  };
  const state = await loadState();
  const setList = (n: string, l: State["lists"][string]): State => ({ ...state, lists: { ...state.lists, [n]: l } });

  if (event.type === UserInputEventType.ButtonClickEvent) {
    if (name === "sync") return void (await resync(state));
    if (name.startsWith("remove:")) {
      const { [name.slice("remove:".length)]: _, ...lists } = state.lists;
      const next = { ...state, lists };
      await saveState(next);
      return void (await home(next));
    }
    if (name.startsWith("review:")) {
      const n = name.slice("review:".length);
      const l = state.lists[n];
      const candidate = await verifiedPin(l?.pending);
      if (!l?.pending || !candidate) return void (await home(state));
      if (!(await confirm(<MaintainerDialog name={n} current={await verifiedPin(l.pinned)} candidate={candidate} />))) return void (await home(state));
      const { pending, ...rest } = l;
      return void (await resync(setList(n, { ...rest, pinned: pending, status: "accepted, new maintainer confirmed" })));
    }
    return;
  }

  // Text inputs also send change events on every keystroke; only the follow toggles act on them.
  if (event.type === UserInputEventType.InputChangeEvent && name.startsWith("follow:")) {
    const n = name.slice("follow:".length);
    const l = state.lists[n];
    if (!l) return;
    const next = setList(n, { ...l, followed: event.value === true });
    await saveState(next);
    // A newly followed list needs its writers synced; an unfollowed one only drops out.
    return void (await (event.value === true ? resync(next) : home(next)));
  }

  // Policy changes apply to the next evaluation; the synced flags are unchanged, so no resync.
  if (event.type === UserInputEventType.InputChangeEvent && (name === "threshold" || name === "checkApprovals" || name.startsWith("warnOnly:"))) {
    const p = state.policy;
    const c = Number(name.slice("warnOnly:".length));
    const policy =
      name === "threshold"
        ? { ...p, threshold: event.value === "1" ? (1 as const) : (2 as const) }
        : name === "checkApprovals"
          ? { ...p, checkApprovals: event.value === true }
          : { ...p, warnOnly: event.value === true ? [...new Set([...p.warnOnly, c])] : p.warnOnly.filter((x) => x !== c) };
    const next = { ...state, policy };
    await saveState(next);
    return void (await home(next));
  }

  if (event.type === UserInputEventType.FormSubmitEvent && name === "add") {
    const parsed = parseListName(event.value.listName);
    if ("error" in parsed) return void (await home(state, { listName: parsed.error }));
    if (state.lists[parsed.name]) return void (await home(state, { listName: `${parsed.name} is already in your lists.` }));
    const list = await fetchCandidate(state, parsed.name);
    if (typeof list === "string") return void (await home(state, { listName: list }));
    if (!(await confirm(<AddListDialog name={parsed.name} list={list} />))) return void (await home(state));
    return void (await resync(setList(parsed.name, { followed: true, pinned: list.signed, status: "accepted" })));
  }

  if (event.type === UserInputEventType.FormSubmitEvent && name === "network") {
    const parsed = parseRpcUrl(event.value.rpcUrl);
    if ("error" in parsed) return void (await home(state, { rpcUrl: parsed.error }));
    // A new RPC replays from genesis instead of trusting the old one's checkpoints.
    const next = parsed.url === state.settings.rpcUrl ? state : clearCheckpoints({ ...state, settings: { rpcUrl: parsed.url } });
    await resync(next);
  }
};
