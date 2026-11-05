import type { Verdict, VerifiedList, WriterSync } from "@tocsin/reader";
import {
  Banner,
  Box,
  Button,
  Divider,
  Dropdown,
  Field,
  Form,
  Heading,
  Input,
  Link,
  Option,
  Row,
  Section,
  Spinner,
  Text,
} from "@metamask/snaps-sdk/jsx";
import type { Address, Hex } from "viem";
import type { Assessment } from "./engine";
import type { State } from "./state";

const CATEGORY: Record<number, string> = {
  1: "Poisoning operator",
  2: "Poisoning funder",
  3: "Drainer receiver",
  4: "Malicious delegate",
  5: "Malicious token",
  6: "Paid lookalike",
  7: "Drainer spender",
  8: "Theft proceeds",
};
const categoryName = (c: number) => CATEGORY[c] ?? `Writer-defined category ${c}`;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const writerLabel = (state: State, w: Address) => state.names[w] ?? short(w);
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const RANK: Record<Verdict, number> = { clean: 0, unavailable: 1, warn: 2, block: 3 };
export const worst = (as: readonly Assessment[]): Verdict =>
  as.reduce<Verdict>((v, a) => (RANK[a.evaluation.verdict] > RANK[v] ? a.evaluation.verdict : v), "clean");

export function whyUnavailable(s: WriterSync | undefined): string {
  if (!s) return "not synced yet";
  if (s.status === "synced") return `synced to sequence ${s.seq}`;
  if (s.divergedAt !== undefined) return `unverifiable, chain mismatch at sequence ${s.divergedAt}`;
  return `unverifiable, source failed${typeof s.error === "string" ? `: ${s.error}` : ""}`;
}

const SOURCE_LABEL = { rpc: "the RPC", custom: "a custom URL", snapshot: "the mirror (snapshotURI)" } as const;

/** Sync state, the best-effort sentence, and the ERC framing. Shown under every panel. */
const TrustFooter = ({ state }: { state: State }) => (
  <Box>
    <Divider />
    {state.sync ? (
      <Text size="sm" color="alternative">
        {`Synced at block ${state.sync.block.number}. Leaves from ${SOURCE_LABEL[state.settings.leafSource]}. Header from ${host(state.settings.rpcUrl)}, unverified.`}
      </Text>
    ) : (
      <Text size="sm" color="alternative">Not synced yet.</Text>
    )}
    {state.sync && state.status?.error ? (
      <Text size="sm" color="warning">{`The last sync failed (${state.status.error}); this result uses the sync before it.`}</Text>
    ) : null}
    <Text size="sm" color="alternative">
      Verification is best-effort: the block header comes from an RPC, not a light client, so this check is only as honest as that RPC. The address is checked inside the Snap; the RPC is not anonymised.
    </Text>
    <Text size="sm" color="alternative">
      The chain proves each flag is the writer's, complete and in order. Whether the writer is right is your pinned list speaking.
    </Text>
  </Box>
);

const BANNER = {
  block: { severity: "danger", title: "Blocked by your pinned list", body: "Do not confirm. Writers on your pinned list flag this address." },
  warn: { severity: "warning", title: "Flagged by a writer on your pinned list", body: "One writer flags this address. Check the evidence before you confirm." },
  unavailable: { severity: "warning", title: "Tocsin cannot vouch for this", body: "Not every pinned writer synced, so this is not a clean result." },
  clean: { severity: "success", title: "No pinned writer flags this", body: "Every pinned writer synced and none flags these addresses." },
} as const;

/** The insight panel for one transaction or signature. `assessments` undefined means no sync or list yet. */
export function Panel({ state, assessments }: { state: State; assessments: Assessment[] | undefined }) {
  if (!assessments) {
    return (
      <Box>
        <Banner severity="warning" title="Tocsin has not synced yet">
          <Text>{state.status?.error ?? "Open the Tocsin settings in MetaMask and run a sync."}</Text>
        </Banner>
        <TrustFooter state={state} />
      </Box>
    );
  }
  if (assessments.length === 0) {
    return (
      <Box>
        <Text>No address in this request to check.</Text>
        <TrustFooter state={state} />
      </Box>
    );
  }
  const verdict = worst(assessments);
  const b = BANNER[verdict];
  const unavailable = [...new Set(assessments.flatMap((a) => a.evaluation.unavailable))];
  return (
    <Box>
      <Banner severity={b.severity} title={b.title}>
        <Text>{b.body}</Text>
      </Banner>
      {assessments.map(({ target, evaluation }) => (
        <Section>
          <Row label={target.why}>
            <Text>{short(target.address)}</Text>
          </Row>
          <Row label="Verdict" variant={evaluation.verdict === "block" ? "critical" : evaluation.verdict === "clean" ? "default" : "warning"}>
            <Text>{evaluation.verdict}</Text>
          </Row>
          {evaluation.findings.map((f) => (
            <Box>
              <Row label="Writer">
                <Text>{writerLabel(state, f.writer)}</Text>
              </Row>
              <Row label="Category">
                <Text>{categoryName(f.category)}</Text>
              </Row>
              <Row label="Evidence" tooltip="A transaction hash or the hash of an off-chain evidence bundle. If the explorer finds no transaction, it is a bundle hash.">
                <Link href={`https://sepolia.etherscan.io/tx/${f.evidence}`}>{short(f.evidence)}</Link>
              </Row>
            </Box>
          ))}
        </Section>
      ))}
      {unavailable.length > 0 ? (
        <Section>
          {unavailable.map((w) => (
            <Row label={writerLabel(state, w)} variant="warning">
              <Text>{whyUnavailable(state.sync?.writers[w])}</Text>
            </Row>
          ))}
        </Section>
      ) : null}
      <TrustFooter state={state} />
    </Box>
  );
}

/** snap_dialog confirmation for a changed list maintainer. */
export const MaintainerDialog = ({ name, current, candidate }: { name: string; current: VerifiedList; candidate: VerifiedList }) => (
  <Box>
    <Heading>List maintainer changed</Heading>
    <Text>{`The list at ${name || "the configured record"} is now signed by a different maintainer. Tocsin keeps your pinned list unless you accept.`}</Text>
    <Row label="Pinned maintainer">
      <Text>{current.maintainer}</Text>
    </Row>
    <Row label="Pinned version">
      <Text>{`${current.version}`}</Text>
    </Row>
    <Row label="New maintainer" variant="warning">
      <Text>{candidate.maintainer}</Text>
    </Row>
    <Row label="New version">
      <Text>{`${candidate.version}`}</Text>
    </Row>
    <Text>Accept only if you know why the maintainer changed. A stolen name can point at a list signed by anyone.</Text>
  </Box>
);

export type FormErrors = Partial<Record<"rpcUrl" | "listName" | "customUrl" | "fromBlock", string>>;

export function SettingsPage({ state, list, errors = {}, syncing = false }: { state: State; list: VerifiedList | undefined; errors?: FormErrors; syncing?: boolean }) {
  const s = state.settings;
  const st = state.status;
  return (
    <Box>
      <Heading>Tocsin</Heading>
      <Form name="settings">
        <Field label="RPC URL (header, proofs, ENS)" {...(errors.rpcUrl && { error: errors.rpcUrl })}>
          <Input name="rpcUrl" type="text" value={s.rpcUrl} />
        </Field>
        <Field label="List ENS name" {...(errors.listName && { error: errors.listName })}>
          <Input name="listName" type="text" value={s.listName} placeholder="team.eth" />
        </Field>
        <Field label="Leaf source">
          <Dropdown name="leafSource" value={s.leafSource}>
            <Option value="rpc">RPC above</Option>
            <Option value="custom">Custom URL (lying proxy)</Option>
            <Option value="snapshot">Mirror (each entry's snapshotURI)</Option>
          </Dropdown>
        </Field>
        <Field label="Custom leaf URL" {...(errors.customUrl && { error: errors.customUrl })}>
          <Input name="customUrl" type="text" value={s.customUrl} />
        </Field>
        <Field label="Log deployment block" {...(errors.fromBlock && { error: errors.fromBlock })}>
          <Input name="fromBlock" type="text" value={`${s.fromBlock}`} />
        </Field>
        <Button type="submit" name="save" disabled={syncing}>
          Save and sync
        </Button>
      </Form>
      <Divider />
      <Heading size="sm">Pinned list</Heading>
      {list ? (
        <Section>
          <Row label="Name">
            <Text>{s.listName || "record override"}</Text>
          </Row>
          <Row label="Maintainer">
            <Text>{list.maintainer}</Text>
          </Row>
          <Row label="Version">
            <Text>{`${list.version}`}</Text>
          </Row>
          <Row label="Last check" {...(st?.list && st.list !== "accepted" && { variant: "warning" as const })}>
            <Text>{st?.list ?? "never"}</Text>
          </Row>
          {st?.declinedRoot ? (
            <Row label="Declined" variant="warning">
              <Text>{`A list from a new maintainer (${short(st.declinedRoot as Hex)}) was declined.`}</Text>
            </Row>
          ) : null}
        </Section>
      ) : (
        <Text>No list pinned yet.</Text>
      )}
      <Heading size="sm">Sync</Heading>
      {syncing ? (
        <Box direction="horizontal" alignment="start">
          <Spinner />
          <Text>Syncing…</Text>
        </Box>
      ) : null}
      {st?.error ? (
        <Banner severity="warning" title="Last sync failed">
          <Text>{st.error}</Text>
        </Banner>
      ) : null}
      {state.sync ? (
        <Section>
          <Row label="Header">
            <Text>{`block ${state.sync.block.number}, unverified RPC header`}</Text>
          </Row>
          {Object.values(state.sync.writers).map((w) => (
            <Row label={writerLabel(state, w.writer)} variant={w.status === "synced" ? "default" : "warning"}>
              <Text>{whyUnavailable(w)}</Text>
            </Row>
          ))}
          <Row label="At">
            <Text>{st ? new Date(st.at).toISOString() : "never"}</Text>
          </Row>
        </Section>
      ) : null}
      <Button name="sync" disabled={syncing}>
        Sync now
      </Button>
      <TrustFooter state={state} />
    </Box>
  );
}
