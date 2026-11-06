// Home page input validation. Pure: imports only viem, so `node --test` runs it.
import { normalize } from "viem/ens";

/** An https URL, or http for localhost (the lying proxy). */
export function parseRpcUrl(raw: unknown): { url: string } | { error: string } {
  try {
    const u = new URL(typeof raw === "string" ? raw.trim() : "");
    const local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (u.protocol === "https:" || (u.protocol === "http:" && local)) return { url: u.href };
  } catch {
    // fall through
  }
  return { error: "Enter an https URL (http only for localhost)." };
}

/** A normalised ENS name with at least one dot. */
export function parseListName(raw: unknown): { name: string } | { error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  try {
    const name = normalize(s);
    if (name.includes(".")) return { name };
  } catch {
    // fall through
  }
  return { error: `"${s}" is not an ENS name such as name.tocsin.eth.` };
}
