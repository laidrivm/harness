# cloud-sessions

## Why

In a Claude Code cloud session or a routine the harness is switched off: the
VM is a fresh clone with no `node_modules/harness/`, so every hook falls back
to its pre-install branch, and the one command that would install it,
`bun install`, sits under `ask` — a routine on 2026-10-20 stopped there for a
manual allow. Once installed, the goal check and the board loop still cannot
read a pull request, because `bun/pull-requests.ts` reads through
`gh pr list`, and the cloud's GitHub proxy refuses GraphQL under any token
(`HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use
the REST API`, seen live on 2026-10-20).

## What Changes

- A cloud session installs the harness as it starts. The `SessionStart` hook
  the harness registers runs `bun install --frozen-lockfile --ignore-scripts`
  first when `CLAUDE_CODE_REMOTE` is `true`, then the stale-install notice as
  today. A hook is no tool call, so neither the bootstrap nor the `ask` entry
  sees it, and outside the cloud it does nothing: the local policy is
  unchanged.
- The README gains a *Cloud sessions* section: the environment to create, the
  setup script `npm i -g bun@1.4.2`, what the cloud does not carry, and how a
  routine's prompt is written. A test holds the setup script's bun version to
  the one every workflow and the README's bump workflow name, and the README
  says nothing updates that pin but a hand edit of every site.
- `bun/pull-requests.ts` reads a branch's pull requests through GitHub's REST
  API (`gh api repos/<owner>/<repo>/pulls?head=<owner>:<branch>&state=all`),
  and one translation turns each into the fields both callers read today:
  `OPEN` for `open`, `MERGED` for `closed` with `merged_at`, `CLOSED`
  otherwise, `headRefOid` from `head.sha`. Owner and name come from
  `origin`'s URL. A fork's pull request from a branch of the same name is not
  found, as intended.
- `core/autonomy.md` gains the rule that a routine's prompt is the line
  `This session runs unattended.` and one call of a tracked skill with its
  parameters, never a procedure. A new owned skill, `cloud-probe`, reports
  whether the harness installed and its gates run, and pushes nothing.
- A third group moves the self-pin past the first two. The live checks no
  test can make — in a cloud session and a trial routine: the command guard
  refuses a commit on `main`, the turn gate runs, the question gate's
  `PermissionRequest` hook fires, and the goal check reads a pull request
  through REST — are deferred to a card of their own (user, 2026-10-21), so
  what they would have read stays unverified live.

### User acts

Only the user can do these; a task that needs one says so.

- Keep GitHub connected to cloud sessions and the Claude GitHub App
  installed on `harness` alone, as for the spike.
- Keep the `harness` cloud environment as the README's *Cloud sessions*
  section sets it: Trusted network, its setup script, no variables or
  secrets.
- Approve the `bun install` that moves the self-pin (task 3.1), which
  prompts.

## Non-goals

- Consumers. d2ass and mellon each have a card on their own board for their
  cloud trial; their `github:laidrivm/harness#…` pin gets 403 from the proxy,
  which serves tarballs only for the session's repositories.
- The board loop in a routine: it stays on the VPS (change `vps-board-loop`).
  Timer and trigger flows run there too, audits and blog reading included
  (user, 2026-10-21); a routine remains an option, under the rule above.
- The live checks in a cloud session and a trial routine: a card of their
  own (user, 2026-10-21).
- The cloud's built-in GitHub tools, which post as the user past Bash, where
  neither the command guard nor `deny` sees them. Named in design.md's risks.
- Keeping `gates.jsonl` past the VM, and running `.githooks` there: CI runs
  `bun test` and the diff budget on every pull request.
- A `PreToolUse` copy of the question gate, unless the deferred live checks
  find the `PermissionRequest` hook does not fire in the cloud.

## Capabilities

### New Capabilities

- `cloud-sessions`: what a Claude Code cloud session or routine does to run
  the harness — the install at session start and the setup script's bun pin.

### Modified Capabilities

- `stage-goal`: gains *A branch's pull requests are read through GitHub's
  REST API*, beside *A pull request read that does not answer is a failed
  try*, whose text it leaves true.
- `agent-autonomy`: gains *A routine's prompt is the declared line and one
  tracked skill*, beside *A session is attended unless the prompt that
  started it says otherwise*.
- `agent-permissions`: *GitHub write commands are denied* lets through the
  one `gh api` write that opens a pull request, the act `gh pr create`
  performs, since a cloud session cannot run `gh pr create` (user,
  2026-10-20; design.md D10).

## Impact

- `bun/pull-requests.ts`, its callers `bun/goal-check.ts` and
  `bun/board-loop.ts`, and the `gh` stubs in `bun/goal-check.fixture.ts` and
  `bun/board-loop.fixture.ts` with the tests that read their calls.
- `bun/bootstrap.ts` (`NOTICE`), and through `bun/sync.ts` the tracked
  `.claude/settings.json` here and every consumer's at its next bump.
- A new `bun/bun-version.test.ts`; `README.md`; `core/autonomy.md`; a new
  `core/skills/cloud-probe/` and its link under `.claude/skills/`.
- No new dependency.
