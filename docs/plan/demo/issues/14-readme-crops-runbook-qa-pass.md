# 14: README CROPS section, demo runbook, fresh-reviewer QA pass

Spec: `docs/plan/demo/spec.md`, Success criteria; Judge checks; Further notes, who pays. README, CROPS section. Ship ethskill, Minimal ship checklist, last item.

**What to build:** A judge reads the README and every CROPS claim matches what the shipped hosts do; someone with a fresh clone and the env file runs seed, relayer, detector, proxy, and mirror from the runbook; and a reviewer who did not build the primary host runs the qa checklist against it before the final rehearsal.

**Blocked by:** 09 (Detector), and whichever of 10 (Kohaku) or 12 (Snap) is the primary host per ticket 02

**Ethskills:** crops, qa, concepts (per AGENTS.md; load before starting)

**Status:** ready-for-agent

- [ ] README CROPS section rewritten against the shipped code: operator powers (none), what survives the team disappearing (log, pinned lists, every host), what an observer learns (no per-subject query leaves the device; which reads are anonymised per transport), and the trust level of each host as wallet-integrations states it.
- [ ] Walkaway test performed and recorded: with the team's name and static host unreachable, the primary host keeps working from the pinned list and the log.
- [ ] Runbook: exact commands and environment variable names for seed, relayer, detector, proxy, and mirror, the three funded addresses and the faucet, no secret values.
- [ ] Judge checks from the spec each mapped to where they are demonstrable, and the ENS prize line states whether the step-8 fallback triggered.
- [ ] A fresh-context reviewer who did not build the primary host runs the qa ethskill checklist against it and the findings are recorded in Comments and fixed or accepted.
