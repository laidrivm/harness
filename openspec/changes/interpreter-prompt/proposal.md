# interpreter-prompt

## Why

`bun/command-guard.ts` reads a shell's `-c` text and an `eval`'s, so `bash -c
"git push --force"` is refused. It reads nothing an interpreter runs:
`python3 -c "import subprocess; subprocess.run(['git', 'push', '--force'])"`,
`bun -e`, `node -e`, a throwaway script run as `bun /tmp/x.ts`, and `printf
'git commit' | sh` all carry a refused act past it as text it never parses.
The last Safety rule of `core/rules.md` forbids that route in prose, and
agents broke the session brief's matching prose four times in one night
(2026-10-12/13). The spec's hook requirement names `python -c` as the accepted
residual ceiling.

`settings-local-sweep` drops every local grant of an interpreter, but the next
"Yes, and don't ask again" puts one back, and an `allow` in
`.claude/settings.local.json` is all it takes. That change's design, under
*Interpreters stay behind a prompt*, left closing the class to a command-guard
check, because `ask` entries would change the shipped policy for every
consumer and still miss `bun --eval` and `python3 -Ic`.

## What Changes

- The command guard answers `ask` (exit 0, a `PreToolUse`
  `permissionDecision` on stdout) when an interpreter is given program text it
  cannot read: inline code, a script file its repository neither tracks nor
  installed under `node_modules/`, or code on standard input. A hook's `ask`
  prompts even in auto mode. Whether a matching `allow` rule silences it is
  measured during apply. The new requirement lists the interpreters and the
  exemptions. A shell's `-c` text is still read and checked, never asked
  about, and `bun x` is left to the `bunx` change.
- A block anywhere in the same command still wins.
- The gate ledger records each prompt under its own id.
- `agent-permissions` §*The git prohibitions are enforced by a hook* names
  the third outcome and stops accepting `python -c` as its ceiling.

## Non-goals

- **`ask` entries in `.claude/settings.json`.** `bun/settings.ts` compares
  the Bash `ask` list whole for every consumer, and a prefix entry misses
  `bun --eval`, `python3 -Ic` and `/usr/bin/python3`. The hook resolves
  spellings, and the permission list does not.
- **Reading the interpreted code** for `git`, `gh` or `subprocess`. Code is
  easily assembled from strings, so a search would only give false comfort.
- **Refusing `sed -i`, heredoc redirections and other shell file writes.** A
  file write from the shell has more spellings than a guard can list
  (redirection, `tee`, `cp`, `dd`, `awk -i inplace`). The gated files carry
  `Edit` rules, which a redirection already meets. `perl -pi -e` and a Python
  edit fall under this change, because they are interpreters.
- **`bunx` and `bun x`**, which belong to the change that blocks curl-to-shell
  pipes and unchecked `bunx`. A `curl … | sh` matches both checks. Its block
  outranks this check's prompt.
- **How the guard reads a heredoc body**, which belongs to the change that
  stops it reading a quoted heredoc as commands.
- **Other runners**: `make`, `find -exec`, `awk`'s `system()`, a git alias,
  `bun test` given a path, and `bun build` macros. These remain the stated
  ceiling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-permissions`: a new requirement holds an interpreter given unread
  program text behind a prompt. §*The git prohibitions are enforced by a
  hook* gains the `ask` outcome and drops `python -c` from its accepted
  ceiling.
- `gate-ledger`: a prompt a guard asks for is recorded, beside its refusals.

## Impact

- `bun/command-guard-interpreters.ts`, a new module beside
  `command-guard-gh.ts`. It returns a reason or nothing, and the guard owns
  the decision and the ledger id. `bun/command-guard.ts` collects the reasons
  and emits the `ask` JSON after `check`.
- `bun/command-guard-interpreters.test.ts`, new.
- `openspec/specs/agent-permissions/spec.md` and
  `openspec/specs/gate-ledger/spec.md`, through this change's deltas.
- `.claude/settings.json` is unchanged. Measured 2026-10-13 across this
  repository, `d2ass` and `mellon`: no documented agent command uses inline
  interpreter code, and every script they name is tracked, under
  `node_modules/harness/` or a package script. Of the local grants, only
  `d2ass`'s `sh .git/hooks/pre-commit` would now prompt.
- Open pull requests nearby: #86 modifies the same hook requirement, so
  whichever of the two archives second re-copies it. #96 syncs
  `settings-local-sweep` into the same spec file, under other requirements.
