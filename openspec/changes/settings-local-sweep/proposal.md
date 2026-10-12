# settings-local-sweep

## Why

Every "Yes, and don't ask again" a session answers is saved to the untracked
`.claude/settings.local.json`, so that file is where the tracked policy's gaps
pile up — and nothing reads it. An unattended agent sees each of those gaps as
a prompt nobody answers, which is a silent refusal; the tracked
`.claude/settings.json` has to hold what the workflow needs, and the local
file is the only record of what it lacked.

Measured on 2026-10-12, by entry and without quoting the files: the harness's
own checkout holds 24 allow entries, d2ass's 44 and mellon's 16. Across the
three, 12 restate a grant the same repository's tracked file already makes, one
re-grants a command the tracked file gates behind a prompt, 10 name a path only
one machine has, and 61 are neither — each a command the tracked policy
should take or a one-off that belongs nowhere. The curation that
`agent-permissions` §*The tracked allow list holds only what a clone can use*
records moved d2ass's stable set out of its local file; 42 entries had
accumulated there again by 2026-09-30.

Closest existing artefacts: that requirement, which fixes what may enter the
tracked allow list and leaves telling a one-off from policy to review; and the
board card "Run the hygiene audits on a timer or after N merged changes", which
owns when and where this sweep reruns. This change owns the sweep itself and
the harness's own clean-up.

## What Changes

- A local-only command, run from a repository's root, reads
  `.claude/settings.local.json` and sorts each `allow` entry against the same
  repository's tracked `.claude/settings.json`: already decided there
  (granted, refused or gated behind a prompt), machine-local, or a gap. It
  fails while any entry but a machine-local one remains, naming each with its
  class, and it never writes either file.
- It stays out of `bun/check.ts`'s run. A clone and CI have no local file, so a
  check there would pass on an absent input; and §*The permission policy is
  pinned by a test* already forbids that check reading the file.
- The README's *Consuming* list gains the command, beside `check.ts`.
- The harness's own clean-up: what an unattended session following the
  documented workflow needs moves into its tracked `.claude/settings.json`,
  including the general form of a command whose local grants name one
  machine's path. The pull request names each promotion and the largest
  dropped group, as the curation criterion requires, and gives a reason for
  each arbitrary-code runner, whether promoted or refused.
  Pruning the local file is the user's, on their machine.

## Non-goals

- **Scheduling the sweep.** When it reruns, and on which host, is the hygiene
  audits card's; the file is gitignored, so the answer is a machine of the
  user's and never a clone.
- **Editing the local file.** Whether a gap is promoted or dropped is a review
  judgement, so the command reports and a person decides.
- **d2ass's and mellon's clean-ups.** Each repository curates its own tracked
  allow list; each runs the command after its pin carries it.
- **User-level settings.** A grant in `~/.claude/settings.json` does not reach
  an unattended host whose user level differs, so it does not close a gap.
- **`deny` and `ask` entries in the local file.** They tighten the policy and
  leave no gap in it.

## Capabilities

### New Capabilities

None. The sweep compares two settings files that `agent-permissions` already
specifies; a capability of its own would put a second specification over one
policy.

### Modified Capabilities

- `agent-permissions`: gains the requirement that the untracked settings file
  is swept against the tracked policy, with what the sweep reports and what it
  lets stay.

## Impact

- A new command and its test under `bun/`; `bun/settings.ts` lends it the
  machine-local test it already applies to the tracked allow list, so the two
  cannot disagree about what a machine-local entry is.
- `.claude/settings.json` — the promoted allow entries.
- `README.md` — one bullet under *Consuming*.
- `openspec/specs/agent-permissions/spec.md` — one requirement added.
- No dependency, workflow or hook change. Consumers receive the command with
  their next pin bump and nothing runs it for them.
