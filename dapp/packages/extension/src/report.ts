// What the background hands the overlay, and what the overlay does with each verdict. Plain JSON
// (chrome messaging drops bigints), and nothing in it echoes the intercepted request beyond the
// addresses that were checked.

export type Verdict = "clean" | "warn" | "block" | "unavailable";

export type ReportFinding = { writer: string; category: string; evidence: string };

export type ReportItem = { why: string; address: string; verdict: Verdict; findings: ReportFinding[] };

export type Report = {
  verdict: Verdict;
  /** Why there is no verdict yet (light client syncing, no list, worker down). Only with `unavailable`. */
  reason?: string;
  items: ReportItem[];
  /** Pinned writers whose leaves could not be verified, and why. */
  unavailable: { writer: string; why: string }[];
  /** How the result was reached: block, header verification, transport, list. */
  trust: string;
};

export const unavailableReport = (reason: string): Report => ({
  verdict: "unavailable",
  reason,
  items: [],
  unavailable: [],
  trust: "No sync result to check against.",
});

export const OVERRIDE_DELAY_MS = 5_000;

export type Plan =
  | { show: false }
  | {
      show: true;
      tone: "danger" | "warning";
      title: string;
      body: string;
      proceedLabel: string;
      cancelLabel: string;
      /** The proceed button stays disabled this long. */
      overrideDelayMs: number;
    };

/** clean passes silently; block holds the override back; warn continues on confirm; unavailable says why and continues. */
export function plan(r: Report): Plan {
  switch (r.verdict) {
    case "clean":
      return { show: false };
    case "block":
      return {
        show: true,
        tone: "danger",
        title: "Blocked by your pinned list",
        body: "Do not continue. Independent writers on your pinned list flag an address in this request.",
        proceedLabel: "Override and open wallet",
        cancelLabel: "Stop this request",
        overrideDelayMs: OVERRIDE_DELAY_MS,
      };
    case "warn":
      return {
        show: true,
        tone: "warning",
        title: "Flagged by a writer on your pinned list",
        body: "Check the evidence before you continue.",
        proceedLabel: "Continue to wallet",
        cancelLabel: "Stop this request",
        overrideDelayMs: 0,
      };
    case "unavailable":
      return {
        show: true,
        tone: "warning",
        title: "Tocsin cannot check this request",
        body: r.reason ?? "Not every pinned writer synced, so this is not a clean result.",
        proceedLabel: "Continue to wallet",
        cancelLabel: "Stop this request",
        overrideDelayMs: 0,
      };
  }
}
