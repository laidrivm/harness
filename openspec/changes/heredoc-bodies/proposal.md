# heredoc-bodies

## Why

`bun/command-parse.ts` has no notion of a heredoc. It reads a body line by
line as shell commands, whatever the delimiter's quoting, so it fails in both
directions:

- **A false refusal.** Prose that names a git command, fed through
  `<<'EOF'` — a pull request body, a commit message, a document — is refused
  as if it ran. `gh pr create --body-file - <<'EOF'` whose body held the line
  `git push * --delete *` was refused while harness#43 was being opened.
- **A hidden command.** A body is text, so an apostrophe in it means nothing
  to the shell. The scanner reads it as an opening quote, and that quote
  swallows every line after it, the commands after the closing delimiter
  included. So a body holding `don't` hides a force-push written after it.

Probed against the guard on `68a852f`. Each command is shown with its lines
joined by `⏎`:

| command | guard | right |
| --- | --- | --- |
| `gh pr create --body-file - <<'EOF'⏎git push * --delete *⏎EOF` | exit 2, `unbounded-push` | allow |
| `cat > /dev/null <<'EOF'⏎don't⏎EOF⏎git push --force origin feat/x` | exit 0 | block |
| `cat <<EOF > /dev/null⏎don't⏎EOF⏎git push --force origin feat/x` | exit 0 | block |
| `cat <<EOF⏎$(git push --force origin feat/x)⏎EOF` | exit 2, `force-push` | block |
| `bash <<'EOF'⏎git push --force origin feat/x⏎EOF` | exit 2, `force-push` | block |

The last two rows are controls, and they must stay blocked. An unquoted body runs
its command substitutions, and a shell reading a body as its script runs all
of it. So the fix cannot be "skip every heredoc body".

## What Changes

- The scanner recognises a heredoc operator — `<<` and `<<-`, never `<<<` —
  outside quotes, comments and arithmetic. It reads the delimiter word,
  notes whether any part of it is quoted, and takes the body from where the
  shell takes it: after the next newline at the operator's own substitution
  level, up to the first line that equals the delimiter. `<<-` strips
  leading tabs. Where the line before ends in a backslash, the joined
  logical line is checked as well, because bash, zsh and sh join there and
  dash does not.
- A quoted delimiter's body is inert. An unquoted delimiter's body is read
  for `$(…)` and backtick substitutions only, which the shell runs before
  the body becomes input, and its other text is dropped.
- A command line that invokes a script reader anywhere — `sh`, `bash`,
  `zsh`, `dash`, `eval`, `source` or `.` — reads every heredoc body on that
  line as a script, whatever the quoting. That covers `bash <<'EOF'`,
  `cat <<'EOF' | sh` and `eval "$(cat <<'EOF' …)"`, all of which run the
  body.
- A heredoc the scanner cannot place is read as it is today, as commands.
  That means an operator whose delimiter line never comes, or whose
  delimiter word holds a `$`, a backtick or a `(`. Reading such a body as
  commands can only over-refuse.
- `openspec/specs/agent-permissions` gains requirements fixing that
  reading. The script-reader one also states its ceiling: a file a heredoc
  writes and the same call then runs by path, as in `./s.sh`, is outside the
  guard, just as `printf '…' > s.sh; ./s.sh` already is.

## Non-goals

- **Here-strings (`<<<`).** `bash <<< 'git push --force'` passes today,
  exactly as `echo '…' | bash` does: a quoted string fed to a shell's stdin.
  That is the pipe-to-shell question, and a sibling change proposing to
  block curl-to-shell pipes owns it.
- **Interpreters reading a body**, such as `python3 - <<'EOF'`. The residual
  ceiling already names an interpreter spawning a subprocess. Keeping inline
  interpreters behind a prompt is a sibling change's work.
- **Shells outside `SHELLS`** (`ksh`, `fish`). This change reuses the set
  that `-c` already reads, and widening it widens both, so it is a change of
  its own.

## Capabilities

### New Capabilities

None. The parser is `agent-permissions`'s, and a capability of its own would
put a second specification over one guard.

### Modified Capabilities

- `agent-permissions`: gains five requirements, one behaviour each:
  *A quoted heredoc's body is data*, *An unquoted heredoc's body runs only
  its substitutions*, *A heredoc body ends where the shell ends it*, *A
  heredoc fed to a script reader is read as a script* and *A heredoc the
  guard cannot place is read as commands*. They are added beside *The git
  prohibitions are enforced by a hook* rather than written into it. That
  requirement already runs to 140 lines of prose and scenarios, and copying
  it whole for a MODIFIED delta would put most of this change's diff in text
  it does not change.

## Impact

- `bun/command-parse.ts` — the scanner carries the heredoc state. It stands
  at 267 lines against the 300-line cap, so the delimiter reader and the body
  collector move to a new `bun/command-heredoc.ts`.
- `bun/command-parse-heredoc.test.ts` — new: the cases, driven through the
  guard as `bun/command-parse.test.ts`'s are.
- `openspec/specs/agent-permissions/spec.md` — five requirements added.
- `bun/command-guard.ts`, `.claude/settings.json` — unchanged.
- Open PR #86 edits `bun/command-guard.ts` and `bun/git-options.ts`, and
  neither file is touched here. Open PR #78 moves the hooks under
  `node_modules/harness/`, which changes where the guard runs from, not what
  it reads.
- No dependency, workflow or runtime change.
