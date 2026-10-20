# cloud-sessions — design

## Context

See proposal.md, *Why*. What the cloud gives, from the docs read on
2026-10-18 and the spike the user ran on 2026-10-20 (both on the card *Make
the harness work in cloud sessions and routines*):

- A fresh VM and a fresh clone per session. The environment's setup script
  runs as root and its result is cached as a snapshot for about seven days,
  so it cannot install a clone it never sees. `SessionStart` runs at every
  start. `CLAUDE_CODE_REMOTE=true` marks the cloud. bun 1.4.2 is
  preinstalled, with what the docs call known proxy compatibility issues.
- Hooks and permissions from `.claude/settings.json` are read only in a
  session with one repository.
- The GitHub proxy serves tarballs only for the session's repositories: the
  self-pin `harness#840570b` installed in a routine with `harness` attached,
  and got 403 in a session without it.
- `gh` GraphQL is refused under any token; REST answers. `gh api
  "repos/laidrivm/harness/pulls?head=laidrivm:<branch>&state=all"` gave
  `number`, `state`, `merged_at` and `head.sha` for #165 (read 2026-10-18).
- In a routine an `ask` entry prompts the user rather than refusing:
  `bun install --frozen-lockfile` waited for a manual allow.
- Not yet seen live: the command guard and the turn gate with the harness
  installed, and whether a `PermissionRequest` hook fires at all.

Decisions the user took on that card, fixed here and not reopened:

1. The cloud is tried on the harness itself first. d2ass and mellon follow,
   each through a card on its own board.
2. Until the GitHub App, cloud sessions and routines push as the user's
   account. `main` is protected by a ruleset: a pull request with one
   approval.
3. The board loop lives on the VPS (change `vps-board-loop`). Routines carry
   only timer flows that read and report.
4. One trial routine, once a day, switched off after the spike.

## Goals / Non-Goals

**Goals:** a cloud session or routine on `harness` that starts with its
gates installed and live, with no prompt; a goal check and board loop that
read pull requests where GraphQL is refused; a routine whose procedure is
reviewed code.

**Non-Goals:** the proposal's; besides, changing any `ask`, `allow` or
`deny` entry, and any change to the bootstrap's text.

## Decisions

### D1. The install runs in the `SessionStart` hook, before the notice

`NOTICE` in `bun/bootstrap.ts` gains a prefix: when `CLAUDE_CODE_REMOTE` is
exactly `true`, run `bun install --frozen-lockfile --ignore-scripts` in
`${CLAUDE_PROJECT_DIR:-.}` with its output captured, and on failure print one
line naming the failed install and the output's last line. The notice then
runs as today, so after a failed install it says the harness is not
installed, and after a successful one it prints nothing. Every path still
ends in `|| true`.

A hook's command is run by Claude Code, not by the model through the Bash
tool, so the Bash `PreToolUse` bootstrap never sees it and no permission rule
applies to it. That is what lets it past both without touching either: the
bootstrap's text, the `ask` entries and *Every manifest-mutating invocation
prompts* stay exactly as they are, and a `bun install` the agent types still
prompts everywhere. Outside the cloud the prefix is one test of an unset
variable.

*Alternatives considered.* A second `SessionStart` hook: Claude Code runs the
hooks of one event in parallel, so the notice would race the install and
could tell the session to run `bun install`, the very prompt this removes.
The setup script: its cached snapshot predates the session's clone. An
`allow` entry for `bun install --frozen-lockfile`: `ask` is evaluated before
`allow` in every scope, so it would not prompt-free the call without deleting
the `ask` entry, which is the local policy.

### D2. Exactly `true`, and only the lockfile's packages

The gate is `[ "$CLAUDE_CODE_REMOTE" = true ]`, the value the docs give, so
an empty, `false` or `1` value installs nothing. `--frozen-lockfile` makes a
manifest the lockfile does not match fail rather than rewrite either file,
and `--ignore-scripts` runs no lifecycle script, as `bump.ts land` already
installs. An install nobody approved runs bun and nothing a package ships.

### D3. The prefix is in `HOOKS`, so consumers receive it

`harness-updates`' *The harness's own sessions run its gates from its pin*
requires the harness to register every hook it gives a consumer with the
consumer's text, so a harness-only variant would be a second registration to
keep in step. A consumer gets the prefix at its next bump through
`sync.ts`. Locally it does nothing there. In a consumer's cloud session the
install fails on the proxy's 403 for the harness tarball and prints its line,
which is the state that consumer's own card starts from.

### D4. The setup script pins CI's bun, held by a test

README's *Cloud sessions* section gives the setup script as one line,
`npm i -g bun@1.4.2`, and says what `rules.md` asks beside a pin no manifest
tracks: nothing updates it but a hand edit of every site, the workflows'
`bun-version` and the README's bump workflow included. npm rather than the
preinstalled bun's own upgrade, since npm is on the image and the docs name
the preinstalled bun's proxy issues.

A new `bun/bun-version.test.ts` reads the version from that line and every
`bun-version:` in `.github/workflows/*.yml` and in `README.md`, and fails
naming each site that differs, or naming what it found none of. One test file
rather than a check in `check.ts`: these sites are the harness's own, and a
consumer's are its own card's (`bun-version-sites` moved to d2ass).

### D5. One REST read and one translation

`readPullRequests(branch)` keeps its file, its time limit, its `SIGKILL` and
its `undefined` for a failed read, and drops its `fields` parameter. It runs

```text
gh api "repos/<owner>/<repo>/pulls?head=<owner>:<encoded branch>&state=all&per_page=100"
```

and translates each element to `{ number, state, headRefOid }`: `OPEN` for
`open`, `MERGED` for `closed` with a non-null `merged_at`, `CLOSED`
otherwise, `headRefOid` from `head.sha`. `goal-check.ts` and `board-loop.ts`
read those fields as they read `gh pr list`'s today, so neither decides
differently. The branch is passed through `encodeURIComponent`. REST lists
newest first, as `gh pr list` did, so the pull request each caller names is
the same one.

`per_page=100` replaces `--limit 1000`: one branch holding more than a
hundred pull requests is not a case this tree meets, and the comment says so
in the `shortcut:` form.

### D6. Owner and name from `origin`'s resolved URL

`git remote get-url origin`, which applies `insteadOf` rewrites, so the URL
read is the one git uses. Owner and name are its last two path segments, a
trailing `/` and `.git` dropped, each matched whole against GitHub's name
characters (`[A-Za-z0-9._-]+`); the scp form `git@host:o/r` counts its colon
as a separator. Any host is accepted, since the cloud clone's `origin` may be
a proxy URL. A URL that yields no two such segments fails the read before
`gh` runs.

*Alternative considered.* `gh api repos/{owner}/{repo}/…`, whose placeholders
`gh` fills from the clone's remotes. It needs a remote on a host `gh` knows,
and what the cloud clone's `origin` reads is unprobed; the parse works for
either. Task 4.1 reads it live.

`github-app-identity`'s group 2 plans an `origin` parse of its own in
`bun/github-app.ts`, refusing every host but GitHub's. Whichever lands second
imports the other's segment parse, as `rules.md` asks of logic written
twice; the host check stays the App's, since a token must not go to a proxy.

### D7. A routine calls a tracked skill: the rule and `cloud-probe`

`core/autonomy.md` gains a short *Routines* section stating the rule the
`agent-autonomy` delta fixes, and README's *Cloud sessions* points to it. No
test can read a routine's prompt, which is stored in claude.ai; the rule is
what the user applies when creating one, and the trial routine is its first
case.

The trial routine needs a skill to call, so the change adds an owned one,
`core/skills/cloud-probe/SKILL.md`, linked at `.claude/skills/cloud-probe`,
with a row in README's skill table. It carries no `disable-model-invocation`:
`agent-permissions`' *Who may invoke a skill is enforced, not narrated* fails
a skill with the flag and no step left to the user, and a probe that reads is
safe for the agent to run. It reports, in order:

- `CLAUDE_CODE_REMOTE`, `bun --version`, and the lines the session started
  with;
- whether `node_modules/harness/` exists, and the commit its `.bun-tag`
  names, against the pin in `package.json`;
- the form of `origin`'s URL with any user part dropped, which D6 parses;
- whether the turn gate's mark for this session exists in the `turn-gate`
  directory under the temp directory, which shows its `UserPromptSubmit`
  half ran from the pin;
- on `main`, what `git commit --allow-empty -m cloud-probe` answers — the
  command guard refusing it is the pass; elsewhere, the branch and that it
  skipped;
- the last line of `bun node_modules/harness/bun/goal-check.ts propose
  <slug>`, for the change its one parameter names (`cloud-sessions` in the
  trial), where `no open or merged pull request for <branch>` shows
  the REST read answered and `could not be read` shows it did not.

It never pushes, posts or edits a file; a commit the guard fails to refuse
stays on the disposable VM, and the report says so. It ends with one line
per item.

*Alternative considered.* A tracked list of routine prompts with a test. It
would be a copy of text whose original lives in claude.ai, and drift there
is what the rule is written against.

### D8. The question gate is checked live before anything is built for it

Whether Claude Code fires `PermissionRequest` in the cloud is undocumented,
and the spike shows a routine prompts, which is the event that hook answers.
Group 4 asks an attended cloud session for one call the gate does not allow:
a comment on this change's card whose text does not open with the mark. The
gate gives no answer there, so the prompt shows and the user declines it. The
gate records every call it sees, so a `question-gate` record in the VM's
`gates.jsonl` for that call shows the hook fired, and none shows it did not.
Only in the second case is a `PreToolUse` copy filed, as an `idea` card, not
built here.

### D9. Four groups

1. The REST read: code and tests, nothing cloud-specific.
2. The install prefix, the setup script and its test, the README section,
   the routine rule and `cloud-probe`.
3. After both merge: the self-pin moved past them.
4. After that merges: the live checks, recorded in the pull request's
   *Check by hand* list, and the design amended through `/opsx:update` where
   they disagree with it.

Group 4 waits on the pin because the gates and the goal check a cloud
session runs come from `node_modules/harness/`, a merged commit, and on its
own merge because a cloud session and a routine clone `main`.

## Risks / Trade-offs

- [The cloud's built-in GitHub tools post comments and reviews as the user,
  past Bash, so neither the command guard nor `deny` sees them] → this
  change mitigates nothing; `git-and-prs.md` already forbids writing as the
  user through a channel no permission entry reaches. A mechanism is a card
  of its own.
- [`gates.jsonl` dies with the VM] → `session-wrapup` counts no cloud
  session's lines. `cloud-probe` reads only what the session holds.
- [`.githooks` is off in the cloud, so a push runs no `bun test`] → CI runs
  it and the diff budget on every pull request.
- [Claude Code may hand the first tool call over before `SessionStart` ends]
  → the bootstrap then refuses it with its hint and a `bun install` the
  agent runs prompts; task 4.1 reads which happens.
- [A session with two repositories reads no hooks, so the harness is off
  without a word] → the README says to attach `harness` alone, and
  `cloud-probe` reports the missing install.
- [`gh pr view`, `gh pr create` and the `coderabbit` skill's GraphQL read
  fail in the cloud] → out of scope; see the open question.
- [A consumer's cloud session prints a failed install at every start once it
  bumps] → that is the 403 its card starts from, and locally nothing changes.

## Migration Plan

Group 1 merges and changes nothing visible locally. Group 2 merges; the
next local session's notice is unchanged, and consumers receive the prefix
at their next bump. Group 3 moves the pin, and group 4 runs the checks.
Rolling back
is reverting a group's pull request; the cloud then starts with the harness
off, as today.

## Open Questions

- How a cloud session opens its pull request. `gh pr create` reads GraphQL,
  `gh api -X POST repos/<o>/<r>/pulls` is a write the guard refuses, and the
  cloud's built-in tool for it passes no gate. Nothing in this change's tasks
  depends on the answer; it is the user's to settle, and it is left open.
