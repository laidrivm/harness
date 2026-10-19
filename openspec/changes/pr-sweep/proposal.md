# pr-sweep

## Why

Nothing watches an agent's pull request once it is open. A branch falls behind
`main`, its CI turns red, or its `harness/` copy drifts from the pin, and the
PR waits until the user notices. Some of these states raise no event at all.
Others raise one that can be missed. The user decided (2026-10-17) that a
sweep about once an hour backs up the events rather than replacing them. This
change is its deterministic half: one script per run that does what needs no
agent and names, as records, what does.

## What Changes

- A new script, `bun/pr-sweep.ts <owner>/<repo>`, sweeps one repository's open
  pull requests once and exits. It is engine-neutral: a terminal, cron or any
  orchestrator can start it. It starts no Claude session and needs no clone.
- It acts only on agent pull requests: a `feat/` or `spec/` branch in the same
  repository, authored by the GitHub App or by the runner's own credential.
  It skips drafts. (user decision, 2026-10-18)
- Per pull request, at a head SHA it has not yet marked:
  - a branch behind its base is updated by merge (`gh pr update-branch`
    without `--rebase`), never rewritten;
  - a merge conflict, a drifted `harness/` copy (what `check.ts`'s drift check
    reports), red CI, and a green head whose description may no longer match
    its diff are each handed off;
  - a head still waiting on GitHub or on CI is left for the next run.
- A hand-off is a field of one JSON line per pull request on standard output.
  Red CI goes to the `ciflow` flow, which is not yet proposed. Everything else
  goes to an agent, which fixes a drifted description itself (user decision,
  2026-10-18). Later changes decide who reads the lines.
- The sweep re-runs no CI. A failed check is handed off by name and never
  turned green by a retry (see the `flaky-test-findings` change).
- No state is stored. A judged head is marked with a commit status from the
  sweep's identity, context `harness/sweep`, and a marked head is not judged
  again.
- With the GitHub App configured, every write goes out as the App, through a
  token minted for that repository alone. Without the App, the sweep uses the
  runner user's own `gh` credential, as the board loop's runner does.

Ordering: the App step builds on `bun/github-app.ts`, which
`github-app-identity` group 2 adds. `.openspec.yaml` names that change under
`after:`.

## Out of scope

- How a timer starts the script, in n8n or Windmill. Group 2 of the
  `vps-board-loop` change runs a spike that picks the engine.
- The table from pull request to session, and how an agent is started on a
  hand-off (`claude -r`). Both belong to the next orchestrator slice, which is
  not yet proposed.
- Who acts on a hand-off: the `ciflow` flow and the agent flows are later
  changes.
- Other drifting artefacts the card names: settings from `sync-settings` and
  `.claude/commands/opsx/`. A consumer's CI runs the whole `check.ts`, so
  settings drift arrives as red CI. Lint and format autofix are left out too.
- A gate-ledger record of a run.

## User acts

Only the user can do these. No task of this change does them.

- On the GitHub App, give Commit statuses read and write, not the read-only
  that `github-app-identity` lists, and accept the new permission on each
  installation. If the App does not exist yet, create it with read and write.

## Capabilities

### New Capabilities

- `pr-sweep`: one run over a repository's open agent pull requests. It covers
  which pull requests it judges, when a head counts as handled, what it does
  itself, what it hands off and in what form, and whose identity its writes
  carry.

### Modified Capabilities

None.

## Impact

- New: `bun/pr-sweep.ts` and its tests.
- `bun/pull-requests.ts`: its `gh` time limit is exported, so that the sweep's
  `gh` calls share it.
- `bun/github-app.ts` (once `github-app-identity` adds it): the token request
  takes the permission set from its caller. The board loop keeps its two
  permissions, and the sweep asks for its own.
- `bun/sync.ts`'s `drift` and `bun/bump-pin.ts`'s `pinOf`, reused unchanged.
- `README.md`: a paragraph for the script.
