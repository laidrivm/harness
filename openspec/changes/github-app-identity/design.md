# github-app-identity — design

## Context

`bun/board-loop.ts` launches a stage session whose `/goal` asks it to run the
pre-PR sequence, push and open the pull request, and whose condition is
`goal-check.ts apply <slug> <step>`, met only once a pull request's head is
`HEAD`. `bun/board-loop-session.ts` spawns `claude` with no `env`, so the
session inherits the runner's whole environment. Decisions the user took on
2026-10-18 on the card *Give agents their own GitHub identity through a
GitHub App*, fixed here and not reopened:

1. One App for harness, d2ass and mellon; a token is minted for one
   repository at a time.
2. No Workflows permission.
3. The runner pushes and opens the pull request after the session ends; no
   token is ever inside a session.
4. On `main`, a ruleset of a pull request with one approval, no force-push
   and no deletion, bypassed by the user alone; it replaces the classic
   protection with `enforce_admins`.
5. The loop's commits are authored by `<app>[bot]`.
6. The private key lives only on the VPS, in a file of the runner's own Unix
   user; sessions run as another user with a clean environment — never the
   Keychain, never the laptop.

## Goals / Non-Goals

**Goals:** a first step that moves the push to the runner and cleans the
session's environment using today's credentials; a second that makes the
push the App's when a key is configured.

**Non-Goals:** the proposal's; besides, revoking a token after use (it lives
an hour) and signing the loop's commits.

## Decisions

### The runner pushes, from a check that leaves the pull request out

The session's condition becomes `goal-check.ts apply <slug> <step>
--before-push`: every condition of the full check but the pull request's,
`HEAD` naming a branch included. After the session the runner runs that form
from its judge copy, checks `HEAD` is on the step's branch, pushes
`refs/heads/<branch>` to the same name on `origin` without force, opens the
pull request, and then runs the full check, unchanged, as its verdict.

A flag in the condition rather than an environment variable, because the
condition is text the session reads and the flag shows in it. Matching the
full check's `goal open` for "only the pull request is missing" was the other
way, and it would tie the session's goal to the wording of one reason.

The runner pushes nothing for a session that is not ready: a branch it
pushed half done would read as finished on GitHub, and *An unpushed step
branch does not stop the pass* already carries such a branch to the next
pass.

### The session names the title and the body in its last lines

The session ends its final message with `PR-TITLE: <title>` and then a
`PR-BODY:` line, the body below it to the end. The runner reads them as
untrusted text, as it reads `PICK:`: one of each, in that order, both
non-empty, or no pull request. Whether to open at all stays the session's,
under `autonomy.md`'s `agent` step — a session holding its pull request back,
say over a `TRIAGE` line reading `BLOCKED`, writes no title. The runner
captures the stage session's output, as it does the pick's, and prints it
after: `claude -p` in text mode prints nothing before its final message, so
the user loses no live view.

`claude -p --json-schema` exists (in `claude --help`, read 2026-10-18), but
how it meets `/goal`'s `Stop` hook and the turn gate, which reads the final
message for gate lines, is unprobed, and the `PICK:` parse is already there.

### A session's environment is an allowlist

`board-loop-session.ts` passes `env` built from a fixed list: `PATH`, `HOME`,
`USER`, `LOGNAME`, `SHELL`, `TERM`, `LANG`, every `LC_*`, `TMPDIR`, `TZ`, the
four `XDG_*_HOME`, `CLAUDE_CONFIG_DIR`, Claude's own credential
(`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`), and the harness's
`HARNESS_GH_TIMEOUT_MS` and `GOAL_CHECK_RETRY_MS`. A denylist would pass the
next credential nobody listed. `XDG_STATE_HOME` must pass: the pre-PR record
the session writes is the one the runner's check reads. Claude's credential
is the session's by necessity; decision 3 is about GitHub's. A variable is
added only by a change to the list.

### The App: two settings, everything else asked of GitHub

`HARNESS_GITHUB_APP_ID` and `HARNESS_GITHUB_APP_KEY` (the key file's path), in
the runner's environment, which the allowlist keeps from both sessions. Both
or neither: one alone, an unreadable key, or an `origin` that is no GitHub
repository refuses the pass. Owner and name come from `origin`'s configured
URL, in its HTTPS or SSH form. The installation is looked up
(`GET /repos/{owner}/{repo}/installation`) rather than configured, since one
App on three repositories would otherwise need three more settings. The API
base is `GITHUB_API_URL`, defaulting to `https://api.github.com`, as
`bun/bump.ts` reads it; a test serves it with `Bun.serve`.

The JWT is RS256 over `{iat: now - 60, exp: now + 540, iss: <id>}`, signed
with `node:crypto`'s `sign`, which takes the PKCS#1 PEM GitHub issues.
WebCrypto's `importKey` takes PKCS#8 only, so it would need the key converted
by hand or wrapped in ASN.1 in code. The 60 s back-date is GitHub's own advice
for clock drift, and 540 s stays inside its ten-minute cap. No dependency.

### Identity before the sessions, token after

Before the pick session the runner reads `GET /app` for the slug and
`GET /users/<slug>[bot]` for the bot's id, and sets `GIT_AUTHOR_NAME`,
`GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL` to
`<slug>[bot]` and `<id>+<slug>[bot]@users.noreply.github.com` in the
sessions' environment; git ranks them above `user.name`. A failure there
refuses the pass before any session. Setting `user.name` in the clone, as the
explore suggested, was the other way; it outlives a change of App and is a
write to the user's clone.

After the stage session the runner mints the installation token with
`POST /app/installations/{id}/access_tokens`, body `{"repositories":
[<name>], "permissions": {"contents": "write", "pull_requests": "write"}}`.
Minted then, never before, it cannot reach the session, and its hour is not
spent while the session runs. git gets it through `GIT_CONFIG_COUNT`,
`GIT_CONFIG_KEY_0=http.https://github.com/.extraheader` and
`GIT_CONFIG_VALUE_0=AUTHORIZATION: basic <base64 of x-access-token:TOKEN>`,
and `gh pr create` through `GH_TOKEN`, which outranks stored credentials. A
process's environment is readable by its own user alone, where an argument or
a URL holding the token shows in `ps` to every user.

### Two steps, the first with no App

Step 1 is the push, the pull request, the check's form and the allowlist,
pushing with the runner user's own git and `gh` credentials. Step 2 is the
App. Running without an App is no stub step 2 deletes: it is how the runner
works where no key lives, the laptop included, and decision 6 keeps the key
off the laptop.

## Risks / Trade-offs

- [CodeRabbit may skip a pull request a bot opened] → the first App-opened
  pull request is checked by hand for a review; a config change, if needed,
  is a change of its own.
- [On the laptop a session can still push as the user through the Keychain]
  → as today; the VPS board loop's separate user closes it.
- [A step touching `.github/workflows/` is refused to the App] → the pass
  records `open` with the push's failure; that step's push is the user's.
- [A blocked session's branch stays unpushed, out of the user's sight] → its
  question on the card names the branch; the next pass continues it.
- [A token lives its hour after the push] → it names one repository and two
  permissions, and only the runner's user can read where it was held.
- [Commits pushed by the App are unsigned] → as today's; signing is no goal.

## Migration Plan

Step 1 merges and the laptop runner goes on with the user's credentials.
Step 2 merges inert; it acts once the user acts in `proposal.md` are done and
the two settings are set on the VPS. Unsetting them returns the runner to
step 1's behaviour.
