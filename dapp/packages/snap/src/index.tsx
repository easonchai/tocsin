import {
  type OnCronjobHandler,
  type OnInstallHandler,
  type OnSettingsPageHandler,
  type OnSignatureHandler,
  type OnTransactionHandler,
  type OnUserInputHandler,
  UserInputEventType,
} from "@metamask/snaps-sdk";
import { signatureTargets, transactionTargets } from "./decode";
import { type ConfirmMaintainer, assess, clearCheckpoints, pinnedList, runSync } from "./engine";
import { parseSettings } from "./settings";
import { LOG_CHAIN_ID, type State, loadState, saveState } from "./state";
import { type FormErrors, MaintainerDialog, Panel, SettingsPage, worst } from "./ui";

const confirmMaintainer =
  (state: State): ConfirmMaintainer =>
  async (current, candidate) =>
    (await snap.request({
      method: "snap_dialog",
      params: { type: "confirmation", content: <MaintainerDialog name={state.settings.listName} current={current} candidate={candidate} /> },
    })) === true;

// shortcut: a cron tick and a settings sync can overlap and the later save wins; add a lock if that shows up.
async function syncAndSave(): Promise<State> {
  const state = await loadState();
  const next = await runSync(state, confirmMaintainer(state));
  await saveState(next);
  return next;
}

export const onInstall: OnInstallHandler = async () => {
  await syncAndSave();
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
  const assessments = await assess(state, transactionTargets(transaction), chainOf(chainId));
  return {
    content: <Panel state={state} assessments={assessments} />,
    ...(assessments && worst(assessments) === "block" && { severity: "critical" as const }),
  };
};

export const onSignature: OnSignatureHandler = async ({ signature }) => {
  if (signature.signatureMethod !== "eth_signTypedData_v3" && signature.signatureMethod !== "eth_signTypedData_v4") return null;
  const { targets, chainId } = signatureTargets(signature.data);
  if (targets.length === 0) return null; // not a permit: stay out of the way
  const state = await loadState();
  const assessments = await assess(state, targets, chainId ?? LOG_CHAIN_ID);
  return {
    content: <Panel state={state} assessments={assessments} />,
    ...(assessments && worst(assessments) === "block" && { severity: "critical" as const }),
  };
};

async function settingsUi(state: State, extra: { errors?: FormErrors; syncing?: boolean } = {}) {
  return <SettingsPage state={state} list={await pinnedList(state).catch(() => undefined)} {...extra} />;
}

export const onSettingsPage: OnSettingsPageHandler = async () => {
  const id = await snap.request({ method: "snap_createInterface", params: { ui: await settingsUi(await loadState()) } });
  return { id };
};

export const onUserInput: OnUserInputHandler = async ({ id, event }) => {
  const show = async (state: State, extra?: { errors?: FormErrors; syncing?: boolean }) =>
    snap.request({ method: "snap_updateInterface", params: { id, ui: await settingsUi(state, extra) } });

  let state = await loadState();
  if (event.type === UserInputEventType.FormSubmitEvent && event.name === "settings") {
    const parsed = parseSettings(event.value);
    if ("errors" in parsed) return void (await show(state, { errors: parsed.errors }));
    const prev = state.settings;
    const n = parsed.settings;
    const sourceChanged = n.leafSource !== prev.leafSource || n.rpcUrl !== prev.rpcUrl || n.customUrl !== prev.customUrl || n.fromBlock !== prev.fromBlock;
    state = { ...state, settings: n };
    if (sourceChanged) state = clearCheckpoints(state);
    // A new list name starts a fresh pin: the old name's maintainer says nothing about the new one.
    if (n.listName !== prev.listName) state = { ...state, pinned: undefined, sync: undefined, status: undefined };
    await saveState(state);
  } else if (!(event.type === UserInputEventType.ButtonClickEvent && event.name === "sync")) return;

  await show(state, { syncing: true });
  const next = await runSync(state, confirmMaintainer(state));
  await saveState(next);
  await show(next);
};
