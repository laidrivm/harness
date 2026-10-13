# heredoc-bodies — design

## Context

`commands()` in `bun/command-parse.ts` is a single left-to-right scan. It
carries four kinds of state: the quote it stands in, a stack of frames that
each `$(`, backtick or `(` suspends, the open `case` count, and whether it
stands in a `case` pattern. A newline is a separator like `;`. Nothing
marks `<<`, so a body's lines are separators and words like any others, and
a quote character in a body changes the scan's state for the rest of the
call. See proposal.md, Why, for what that costs in both directions.

`core/rules.md` asks a scan to carry string, comment, template-expression and
regex-literal state, and to name which of those its language has. For shell
the answer is quotes, comments and substitutions. The heredoc is the shell's
fifth kind, and today it is missing.

Where a body begins and ends was probed in bash, zsh, sh and dash on this
machine (2026-10-13), with scripts whose output shows which lines ran:

| shape | bash | zsh | sh | dash |
| --- | --- | --- | --- | --- |
| delimiter line `EOF ` (trailing blank) | not the end | not the end | not the end | not the end |
| `<<-`, delimiter indented by spaces | not the end | not the end | not the end | not the end |
| unquoted, `EO\` then `F` | end | end | end | not the end |
| quoted, `EO\` then `F` | not the end | not the end | not the end | not the end |
| newline inside `$(…)` after the operator | body not started | body not started | body not started | body not started |
| newline inside backticks after it | body not started | body not started | body not started | body not started |
| newline inside `( … )` after it | body started | body started | body started | body started |
| `<<$x` | delimiter is literally `$x` | the same | the same | the same |

## Goals / Non-Goals

**Goals:**

- Where the guard places a body, it places it where every probed shell does,
  or earlier. Ending a body early reads more lines as commands, and that
  only over-refuses.
- Where it cannot place one, the call is read as it is today.

**Non-Goals:**

- Running or emulating the shell. The scan still decides on words.
- Reading what a body becomes once it is input, other than to a script
  reader (see D4).

## Decisions

**D1. Honour a body only once its delimiter line is found.** The guard
starts a body at a heredoc operator, but treats it as one only if the
delimiter line actually comes. Otherwise it reads the call as today. The
reason is which way an error falls. Placing a body the shell does not see
hides the lines in it, which can let a command through. Missing a body the
shell does see only reads more lines as commands, which can only over-refuse.
Requiring the delimiter line shrinks the first kind of error to calls that
also hold a line equal to the delimiter. The alternative, ending the body at
the end of input as bash does with a warning, would hide everything after a
misread `<<`.

**D2. Mirror the shell's boundaries, and take the earlier end where shells
differ.** A delimiter line must match exactly, and only tabs are stripped
under `<<-`. A line also ends the body when it equals the delimiter once
joined to earlier lines ending in a backslash. bash, zsh and sh join there
and dash does not, so the guard takes whichever end comes first. A quoted
delimiter is joined too, though no probed shell joins it. That ends the body
earlier than the shell does, and only in a case that does not come up in
practice.

**D3. Pending heredocs belong to the substitution level.** The list of
operators waiting for a body is saved and cleared when `$(` or a backtick
suspends a frame, and restored when that frame closes. A plain `( … )`
leaves it alone, because the probe shows a newline inside a subshell starts
the body while a newline inside a substitution does not. Saving the list on
every frame alike would hide a command in exactly the subshell case:
`cat <<'EOF' && (true⏎body⏎EOF⏎)⏎git push --force⏎EOF`.

**D4. A script reader anywhere in the call reads every body as a script.**
The check is one pass over the commands the scan found. Any invocation of
`sh`, `bash`, `zsh` or `dash` (from `SHELLS`), or of `eval`, `source` or `.`,
means each body is scanned again as a whole command line, as today's
reading does. The alternative was to tie each body to the command whose
stdin it feeds. That would need the redirection and pipe model the parser
says it does not have, and it would still miss
`eval "$(cat <<'EOF' …)"`, where the body reaches the reader through a
substitution. Reading the whole call is cruder and fails closed.

A file the heredoc writes and the call runs by path (`./s.sh`) is not
covered. It is the same act as `printf '…' > s.sh; ./s.sh`, which the guard
already allows, because a single-quoted string is data. The spec states that
limit so it reads as a decision and not an oversight.

**D5. An unquoted body yields only what its substitutions hold.** The body
is scanned in a body mode where the only special characters are `$(`, the
backtick and the backslash. The literal text is dropped, not gathered into
words. A body is stdin, not argv, and gathering it would only produce
nonsense commands such as one whose name is `git push --force`.

**D6. `<<` is no operator inside arithmetic, and some delimiters are left
alone.** A frame opened by `$((` or `((` is marked as arithmetic, and a frame
nested inside it inherits the mark. `$(` and backticks clear it, because
they are command contexts again. A delimiter word holding `$`, a backtick or
`(` is not honoured, which sends `<<$(…)`, `$[1<<2]` and the like to today's
reading. `<<<` is consumed as a here-string before `<<` is tested.

**D7. The operator and its delimiter leave the word list.** Today `<<-`
followed by a space-separated delimiter leaves the delimiter word as a
candidate command name. The scan consumes both instead, and drops a
digits-only file descriptor in front of the operator, as in `2<<EOF`.

**D8. The delimiter reader and the body collector move to
`bun/command-heredoc.ts`.** `bun/command-parse.ts` is at 267 lines against
the 300-line cap, and this change pushes it over. The state machine stays in
`commands()`, since the rule on carried state asks for one pass. What moves
out are two pure functions over the source text: one reads a delimiter word
at an offset, and the other finds a body's end from an offset. The doc
comment on `commands()` names every state the scan carries, the heredoc
among them, so a later reader sees that the list is complete.

**D9. No consumer tree to measure.** `feature-workflow.md` asks for a gate
change to be measured against every consumer's tree. The guard reads a
command's words, never a tree, so there is nothing in either consumer to run
it against. The probe table in proposal.md is the measurement, re-run in the
apply step.

## Risks / Trade-offs

- [The guard places a body the shell does not see, e.g. `<<` inside
  `${x/<</y}`, which the scan does not track] → D1 limits this to calls
  that also carry a line equal to the misread delimiter (here `/y}`).
- [A shell outside the four probed ends a body later than all of them] →
  D2 takes the earliest end of the four. A shell that ends later only
  over-refuses. One that ends earlier is the residual risk, and none is
  known.
- [The whole-call rule in D4 refuses a commit message carrying a guarded
  command when the same call also invokes `bash`] → that is today's
  behaviour for every call, so nothing gets worse.
- [Overlap with sibling changes] → the curl-to-shell proposal reads a pipe
  into a shell, and the inline-interpreter proposal reads `python3 -` and
  the like. Neither reads a heredoc body. If either adds readers to a shared
  set, D4 should take them from that set rather than keep a list of its own.
