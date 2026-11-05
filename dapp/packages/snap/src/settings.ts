// The settings form's validation. Pure: imports only viem and types, so `node --test` runs it.
import { normalize } from "viem/ens";
import type { LeafSourceKind, Settings } from "./state";
import type { FormErrors } from "./ui";

const LEAF_SOURCES: readonly LeafSourceKind[] = ["rpc", "custom", "snapshot"];

/** Validates the settings form. Returns the parsed settings or the per-field errors. */
export function parseSettings(v: Record<string, unknown>): { settings: Settings } | { errors: FormErrors } {
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const errors: FormErrors = {};
  const url = (k: "rpcUrl" | "customUrl", httpsOnly: boolean) => {
    try {
      const u = new URL(str(k));
      const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
      if (u.protocol === "https:" || (u.protocol === "http:" && (local || !httpsOnly))) return u.href;
    } catch {
      // fall through
    }
    errors[k] = httpsOnly ? "Enter an https URL (http only for localhost)." : "Enter an http or https URL.";
    return "";
  };
  const rpcUrl = url("rpcUrl", true);
  const customUrl = url("customUrl", false);
  let listName = str("listName");
  if (listName) {
    try {
      listName = normalize(listName);
      if (!listName.includes(".")) throw new Error("no dot");
    } catch {
      errors.listName = "Enter an ENS name such as team.eth.";
    }
  }
  const fromRaw = str("fromBlock") || "0";
  if (!/^\d+$/.test(fromRaw)) errors.fromBlock = "Enter a block number.";
  const source = str("leafSource");
  const leafSource = LEAF_SOURCES.includes(source as LeafSourceKind) ? (source as LeafSourceKind) : "rpc";
  if (Object.keys(errors).length) return { errors };
  return { settings: { rpcUrl, listName, leafSource, customUrl, fromBlock: BigInt(fromRaw) } };
}

