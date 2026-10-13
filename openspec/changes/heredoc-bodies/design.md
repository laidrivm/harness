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

- Where the guard places a body, every probed shell places it there too;
  where they disagree, the call is refused.
  Ending a body early is not safe: the lines read as commands can open a
  quote that hides the command after the real end.
- Where the delimiter line never comes, the rest is read as commands, and
  the shell runs none of it. A delimiter word the guard cannot read refuses
  the call.

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
and dash does not. The guard cannot tell which shell runs the call, and
either end hides lines from one of them, so where a joined line equals the
delimiter the guard refuses the call. No call anyone needs splits its
delimiter that way (PR #101 re-review). A quoted
delimiter is matched literally, as every probed shell matches it. Ending a
body earlier than the shell is not the safe side D1 makes it look: the lines
read as commands can open a quote that hides the command after the real end,
as `cat <<'EOF'⏎E\⏎OF⏎'⏎EOF⏎git push --force` would under a join (PR #101
review).

**D3. Pending heredocs belong to the substitution level.** The list of
operators waiting for a body is saved and cleared when `$(` or a backtick
suspends a frame, and restored when that frame closes. A plain `( … )`
leaves it alone, because the probe shows a newline inside a subshell starts
the body while a newline inside a substitution does not. Saving the list on
every frame alike would hide a command in exactly the subshell case:
`cat <<'EOF' && (true⏎body⏎EOF⏎)⏎git push --force⏎EOF`.

**D4. A script reader anywhere in the call reads every body as a script.**
The check is one pass over the commands the scan found. Any invocation of
`sh`, `bash`, `zsh` or `dash` (from `SHELLS`), of `eval`, `source` or `.`,
or of a command named by a path (below),
means each body is scanned again as a whole command line, as today's
reading does. The alternative was to tie each body to the command whose
stdin it feeds. That would need the redirection and pipe model the parser
says it does not have, and it would still miss
`eval "$(cat <<'EOF' …)"`, where the body reaches the reader through a
substitution. Reading the whole call is cruder and fails closed.

A command named by a path — any name holding a `/`, as in `./s.sh` —
counts as a script reader too, since it runs a file the guard never read.
Today's reading blocks `cat > s.sh <<'EOF'⏎git push --force⏎EOF⏎./s.sh`
only by reading the body as commands, and quoted bodies as data would
otherwise let it through (PR #101 review). It costs a call that both writes
a heredoc and runs a program by path, which none of the commit and pull
request calls this change is for does. `printf '…' > s.sh; ./s.sh` stays
outside the guard, as it is today: a single-quoted string is data.

**D5. An unquoted body yields only what its substitutions hold.** The body
is scanned in a body mode where the only special characters are `$(`, the
backtick and the backslash. A backslash quotes the character after it, so
`\\$(…)` is a literal backslash and a substitution that runs, while `\$(` is
literal: the parity of a run of backslashes decides. The literal text is
dropped, not gathered into
words. A body is stdin, not argv, and gathering it would only produce
nonsense commands such as one whose name is `git push --force`.

**D6. `<<` is no operator inside arithmetic, and some delimiters are left
alone.** A frame opened by `$((` or `((` is marked as arithmetic, and a frame
nested inside it inherits the mark. `$(` and backticks clear it, because
they are command contexts again. A delimiter word holding `$` is matched by
its literal text, since the shell does not expand it: `cat <<$X` ends at a
`$X` line. A word holding a backtick or `(`, as in `<<$(…)`, refuses the
call. Today's reading would let a quote in the body hide the command after
it (PR #101 review), and no call anyone needs spells a delimiter that way.
`<<<` is consumed as a here-string before `<<` is tested.

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

**D10. A scan that ends inside a quote refuses the call.** Each hole the PR
#101 review found has one shape: the guard places a boundary the shell
places elsewhere, a stray `'` in the text between opens a quote, and the
quote runs to the end of the call and hides every command after it. The
probe on main confirms that the guard allows `echo don't⏎git push --force
origin feat/x` today. A call whose text the shell sees as ending inside a
quote or an open substitution is a syntax error, and the shell runs none of
it, so refusing costs nothing there. Where the guard alone sees the open
quote, the refusal is the only sign that it misread a boundary. D1–D6 fix
the boundaries known today; D10 closes the ones found later. It ships in
this change rather than alone: on today's scan it would refuse every
heredoc commit message holding an apostrophe, which D1–D5 read as data.

**Applied.** `commands()` takes the guard's `block` and refuses through it:
`unclosed-quote` for D10, `unplaced-heredoc` for a split delimiter and for a
backtick or `(` in a delimiter word. D2's join is checked both ways: the
body's end under the joined reading is compared with its end under the
plain one, so `x\⏎EOF`, which bash reads as `xEOF` and dash as the end, is
refused too. With D8's two functions out, `bun/command-parse.ts` still
measured 329 lines, so `invocations` and the sets it reads moved unchanged
to `bun/command-words.ts`, beside D4's `readsScript`.

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
- [Overlap with `guard-remote-code` (harness#99)] → that change refuses a
  shell, `source`, `.` or `eval` whose program is not written on the line.
  That refuses `bash <<'EOF'`, `cat <<'EOF' | sh` and
  `eval "$(cat <<'EOF' …)"` whatever their bodies say, under its own reason.
  The two compose without a hole. Under #99 those three calls block before
  D4 is consulted, and D4 still covers a case #99 allows on purpose: a call
  that writes a body to a file and then runs it with `bash s.sh`. The rest of
  this change concerns bodies read by programs that are not shells, such as
  `cat <<'EOF' > file` and `git commit -F - <<'EOF'`, which #99 does not
  touch. Both changes edit `commands()` in `bun/command-parse.ts`: #99 marks
  a command that a substitution interrupts, and this one adds the heredoc
  state. Whichever lands second rebases onto the other.
- [Overlap with the inline-interpreter proposal] → that one is about a
  prompt for `python3 -c` and the like, and it reads no heredoc body. A body
  fed to `python3 -` stays outside both changes, inside the residual
  ceiling.
