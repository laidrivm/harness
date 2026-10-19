# github-app-identity — tasks

Two groups, so the change ships as `feat/github-app-identity-1` and
`feat/github-app-identity-2`. Numbers in brackets refer to the proposal-stage
`/zombies` list in the proposal's pull request. Each group writes its failing
cases first and records that they fail against the tree as it stands.

## 1. The runner pushes and opens the pull request

Closes `stage-goal` §*The check before the push leaves out the pull request*,
`agent-autonomy` §*A session whose launcher pushes names the pull request*,
and `board-loop` §*The runner pushes the step and opens its pull request*,
§*A session's environment is an allowlist* and §*A step branch a session left
is continued*.

- [x] 1.1 Write the failing `--before-push` cases in `bun/goal-check.test.ts`:
      met with no pull request and no `gh` on `PATH`, no `gh` call made; open
      naming a detached `HEAD`, a missing record, a tracked edit; usage and
      exit 2 with nothing recorded for the flag misplaced, doubled or
      misspelt; accepted on `propose` and `archive`; the last line names the
      form and is no gate line [1–9]
- [ ] 1.2 Write the failing environment cases in
      `bun/board-loop-session.test.ts`, the stub `claude` writing its
      environment to a file: `GH_TOKEN` (empty included), `GITHUB_TOKEN`,
      `GH_ENTERPRISE_TOKEN`, `SSH_AUTH_SOCK`, both App settings, `CLAUDECODE`
      and `CLAUDE_PROJECT_DIR` absent from the pick and the stage session;
      `PATH`, `HOME`, `XDG_STATE_HOME` and every `LC_*` passed unchanged, and
      `XLC_ALL` not [10–16]
- [ ] 1.3 Write the failing push cases in a new `bun/board-loop-push.test.ts`
      through `board-loop.fixture.ts`, whose `gh` stub learns to tell
      `pr list` from `pr create` and whose stage stub learns to print a final
      message: one push of exactly the step's ref with no `--force`, then one
      `gh pr create` with base, head, title and the body on stdin; nothing
      pushed when the before-push check is open, `HEAD` is off the step's
      branch, the session timed out or its group outlived it; no pull request
      and `open` for two titles, a title inside the body, a blank title, an
      empty body, the body line first; a trailing CR dropped from the title;
      a refused push neither retried nor forced, recorded `open` with its
      error; an existing pull request at `HEAD` ending `met`; any other create
      failure ending `open`; a tampered pin unable to make the before-push run
      read met; a resumed branch on `origin` pushed fast-forward [17–23, 26–34]
- [x] 1.4 Add `--before-push` to `bun/goal-check.ts` as design.md says, and
      see 1.1 pass with the rest of `goal-check*.test.ts` unchanged
- [ ] 1.5 Build each session's `env` from the allowlist in
      `bun/board-loop-session.ts`, and see 1.2 pass
- [ ] 1.6 Add `bun/board-loop-push.ts` (the title and body parse, the
      before-push run from the judge copy, the branch check, the push and
      `gh pr create`) and call it from `pass()` between the stage session and
      the verdict, capturing the stage session's output and printing it after;
      see 1.3 pass and `bun bun/file-size.ts` keep `board-loop.ts` under 300
- [ ] 1.7 Change the stage prompt in `bun/board-loop.ts`: the first line says
      the runner pushes and opens the pull request, the condition names
      `--before-push`, and a new line asks for `PR-TITLE:` and `PR-BODY:`;
      update `board-loop-stage.test.ts`'s prompt cases for the plain, resume
      and answer forms [24, 25]
- [ ] 1.8 Reconcile the restating sites, read back after the edit: the
      `board-loop.ts` header and its "never deletes, resets or pushes" comment,
      `README.md`'s runner paragraph, `core/feature-workflow.md`'s *Unattended
      stages* (the board loop's variant beside the hand-launched form, which
      stays as it is), and each place that has an unattended session push or
      open the pull request — `core/autonomy.md`'s *Declared* bullet and its
      `agent` class, `core/feature-workflow.md`'s Stage 3 marker,
      `core/review-toolkit.md`'s third-pass marker — saying that under the
      board loop the session names the pull request and the runner opens it;
      verify with `git grep -n -e "the push and the pull request" -e "open the
      pull request" -e "opens the pull request" -- core README.md` that each
      hit either names the board loop's case or is the hand-launched form

## 2. The runner pushes as the GitHub App

Closes `board-loop` §*The runner pushes as the GitHub App when one is
configured*.

- [ ] 2.1 Write the failing cases in a new `bun/github-app.test.ts` against a
      `Bun.serve` API reached through `GITHUB_API_URL`, with a PKCS#1 key from
      `generateKeyPairSync`: the JWT verifies with `iss`, `iat` = now − 60 and
      `exp` = now + 540; the installation lookup path; the token request body
      naming one repository and exactly `contents` and `pull_requests` at
      `write`; the bot name and email; `origin` parsed in its HTTPS, SSH and
      `ssh://` forms, another host or extra segments refused [35, 39–43]
- [ ] 2.2 Write the failing runner cases in `bun/board-loop-push.test.ts`:
      one setting alone, an empty or whitespace-only one, a non-numeric ID, an
      unreadable key (its path named, its contents not) and a failing
      `GET /app` each refuse before any session; a failed mint after the
      session pushes nothing and records `open`; the token in no logged
      argument and in neither session's environment; the stage session's
      environment carrying the four `GIT_*` identity variables; the push
      carrying the extra header through `GIT_CONFIG_*` and `gh` getting
      `GH_TOKEN`; an `origin` in SSH form still pushed to the HTTPS URL with
      the header, never over SSH; with no settings, no API call and no header [36–38, 44–52]
- [ ] 2.3 Add `bun/github-app.ts` (the JWT with `node:crypto`'s `sign`, the
      four calls) and see 2.1 pass
- [ ] 2.4 Wire it into `pass()` and `board-loop-push.ts`: the identity read
      before the pick session, the token minted after the stage session, the
      identity added to the allowlisted environment; see 2.2 pass and
      `board-loop.ts` stay under 300
- [ ] 2.5 Name the two settings, that both or neither are set, and that the
      key's file stays the runner user's alone in `README.md`'s runner
      paragraph; verify by reading the paragraph back
