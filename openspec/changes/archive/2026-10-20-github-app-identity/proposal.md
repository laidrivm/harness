# github-app-identity

## Why

The board loop's agents act on GitHub under the user's own account, so
nothing they push or open can be told apart from what the user did, and
`core/git-and-prs.md` keeps them from ever speaking there as themselves. The
credentials that let them do it reach every session: `bun/board-loop-session.ts`
hands `claude` the runner's whole `process.env`, so a `GH_TOKEN`, a
`GITHUB_TOKEN` or an `SSH_AUTH_SOCK` there is the session's too. A GitHub App
gives the loop an identity of its own, and its installation tokens are
short-lived and scoped to one repository — but scoped to no branch, so the
token cannot be the session's either.

## What Changes

- The stage session no longer pushes or opens the pull request. It ends at a
  committed `HEAD` on the step's branch and, when its pull request is to open,
  ends its final message with the title and the body. Its `/goal` condition
  is the goal check's new before-push form, which leaves the pull request out.
- After the session and everything it started have ended, the runner pushes
  the step's branch, without force, and opens the pull request — only when the
  before-push check reads `goal met` on that branch and the session named a
  title and a body. Its verdict is the full goal check, unchanged, run after.
- Both of the runner's sessions start with an environment built from an
  allowlist, never from `process.env`: no GitHub token, no SSH agent, no App
  setting reaches one.
- With no App configured, the runner pushes and opens with whatever git and
  `gh` credentials its user has — the laptop's today. This is the first step,
  and it works before any App exists.
- With an App configured (its ID and the path of its private key, in the
  runner's environment), the runner mints an installation token for the
  clone's repository alone after the session ends, and pushes and opens as the
  App. The session's commits are authored and committed as `<app>[bot]`.
- The launch form in `core/feature-workflow.md` gains the board loop's variant,
  and `autonomy.md`'s `agent` step says who opens the pull request under it.

Ordering: the App's private key is generated only on the VPS, in a file of
the runner's own Unix user, with sessions running as another user — the VPS
board loop proposal sets that machine up. This change does not wait for it:
its first step runs on the laptop with the user's credentials, and its second
merges inert until a key is configured.

### User acts

Only the user can do these; no task of this change does them.

- Create the GitHub App on the personal account: Contents read and write,
  Pull requests read and write, Commit statuses and Checks read-only, Metadata
  read-only, no Workflows, webhook inactive, installable only on this account.
- Install it on harness, d2ass and mellon, selected repositories only.
- Generate the private key only once the VPS runner user exists, straight into
  that user's file — never on the laptop, never in the Keychain.
- On harness, create a `main` branch ruleset: a pull request with one
  approval, no force-push, no deletion, bypass for the repository admin alone;
  then delete the classic branch protection on `main`, whose `enforce_admins`
  together with the approval rule would leave the user's own pull requests
  unmergeable.

## Non-goals

- The webhook and the orchestrator that receives it, and posting comments as
  the App: the VPS board loop's.
- Isolating a session from credentials outside its environment — the macOS
  Keychain `gh` reads on the laptop, a `~/.git-credentials`. Running sessions
  as a user without them is the VPS board loop's; on the laptop a session can
  still push as the user, as it can today.
- Rulesets on d2ass and mellon, which their own boards carry.
- Pushing a change to `.github/workflows/` as the App: without the Workflows
  permission GitHub refuses it, and that step's push stays the user's.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `board-loop`: the runner pushes and opens the pull request; a session's
  environment is an allowlist; the App's token and identity when one is
  configured. §*A step branch a session left is continued* stops forbidding
  the runner's push.
- `agent-autonomy`: a session whose launcher pushes names the pull request's
  title and body instead of pushing and opening it, added beside §*Three
  classes say what an unattended session does at a step that names the user*.
- `stage-goal`: the check gains a before-push form, which a session whose
  launcher pushes is held to. It is added beside §*An unattended stage runs
  under one goal on the check*, whose text it leaves true: the form still
  prints the check's `goal met` for that stage and change.

## Impact

- `bun/goal-check.ts`: the `--before-push` form.
- `bun/board-loop-session.ts`: the allowlisted environment.
- `bun/board-loop.ts` and a new `bun/board-loop-push.ts`: the prompt, the push
  and the pull request — `board-loop.ts` stands at 287 of its 300 lines.
- A new `bun/github-app.ts`: the JWT, signed with bun's `node:crypto`, and
  four REST calls. No new dependency.
- `core/feature-workflow.md`, `core/autonomy.md`, `README.md`.
