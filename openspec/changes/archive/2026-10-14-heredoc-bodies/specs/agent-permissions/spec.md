# agent-permissions — delta spec

## ADDED Requirements

### Requirement: A quoted heredoc's body is data

The command guard SHALL read no command from the body of a heredoc whose
delimiter word has any part quoted — `<<'EOF'`, `<<"EOF"`, `<<\EOF`,
`<<E"O"F`, and each again with `<<-`. The shell neither expands nor runs that
body, so a guarded command named in it is text, just as it is inside single
quotes.

#### Scenario: A pull request body naming a push

- **WHEN** the agent attempts `gh pr create --body-file - <<'EOF'`, with a
  body line `git push * --delete *`, then `EOF`
- **THEN** the hook allows the call

#### Scenario: Every quoting of the delimiter

- **WHEN** a body line `git push --force origin feat/x` follows `cat <<"EOF"`,
  `cat <<\EOF` or `cat <<-'EOF'`, and the delimiter line ends it
- **THEN** the hook allows each call

### Requirement: An unquoted heredoc's body runs only its substitutions

The guard SHALL read the body of a heredoc whose delimiter is wholly unquoted
for `$(…)` and backtick substitutions, and SHALL check each command they
hold. The rest of the body is input text, so it SHALL NOT be read as
commands. A `$` or a backtick after an odd number of backslashes SHALL stay
literal, as the shell keeps it. After an even number the backslashes quote
each other, so the substitution SHALL be checked.

#### Scenario: A substitution in an unquoted body

- **WHEN** the agent attempts `cat <<EOF`, with a body line
  `$(git push --force origin feat/x)`, then `EOF`
- **THEN** the hook blocks the call

#### Scenario: A backtick substitution in an unquoted body

- **WHEN** the body line is `` `git push --force origin feat/x` `` instead
- **THEN** the hook blocks the call

#### Scenario: Two backslashes before a substitution

- **WHEN** the body line is `\\$(git push --force origin feat/x)` instead
- **THEN** the hook blocks the call, because the first backslash quotes the
  second and the shell runs the substitution

#### Scenario: A plain line in an unquoted body

- **WHEN** the agent attempts `cat <<EOF`, with a body line
  `git push --force origin feat/x`, then `EOF`
- **THEN** the hook allows the call

### Requirement: A heredoc body ends where the shell ends it

The guard SHALL start a body after the next unquoted newline at the
operator's own substitution level. A newline inside `( … )` starts it, and
one inside `$(…)` or backticks does not. The body SHALL end at the first
line equal to the delimiter, with leading tabs stripped for `<<-`. For a
wholly unquoted delimiter, a line that equals the delimiter only once joined
to lines before it ending in a backslash ends the body in bash, zsh and sh
but not in dash, so the guard SHALL refuse the call. A quoted delimiter
SHALL be matched literally, as every shell matches it. The guard SHALL read
every command after that line.

#### Scenario: A quote character in a body

- **WHEN** the agent attempts `cat <<'EOF'`, with a body line `don't`, then
  `EOF`, then `git push --force origin feat/x`
- **THEN** the hook blocks the call

#### Scenario: Two heredocs on one line

- **WHEN** the agent attempts `cat <<'A' <<'B'`, then `x`, `A`,
  `git push --force origin feat/x`, then `B`
- **THEN** the hook allows the call, because the line between `A` and `B` is
  the second body

#### Scenario: A newline inside a substitution on the operator's line

- **WHEN** the agent attempts `cat <<'EOF' $(true`, then
  `git push --force origin feat/x`, `EOF`, `)`, `body`, then `EOF`
- **THEN** the hook blocks the call, because the shell runs the lines inside
  the substitution and starts the body only after `)`

#### Scenario: A delimiter split by a backslash-newline

- **WHEN** the agent attempts `cat <<EOF`, then `EO\`, then `F`, then
  `git push --force origin feat/x`, then `EOF`
- **THEN** the hook blocks the call, because bash, zsh and sh join `EO\` and
  `F` into the delimiter and dash does not

#### Scenario: A split delimiter that dash reads past

- **WHEN** the agent attempts `cat <<EOF`, then `EO\`, `F`, `'`, `EOF`,
  `git push --force origin feat/x`, then `echo "x'" # "`
- **THEN** the hook blocks the call, because dash ends the body only at
  `EOF` and runs the push, while the quotes balance under the joined reading

#### Scenario: A split delimiter under a quoted one

- **WHEN** the agent attempts `cat <<'EOF'`, then `E\`, `OF`, `'`, then
  `EOF`, then `git push --force origin feat/x`
- **THEN** the hook blocks the call, because the shell does not join lines
  for a quoted delimiter, so `'` is body and the push runs after `EOF`

#### Scenario: A space-indented delimiter under the dash form

- **WHEN** the agent attempts `cat <<-'EOF'`, then `  EOF` indented by
  spaces, then `git push --force origin feat/x`, then `EOF` indented by a tab
- **THEN** the hook allows the call, because only tabs are stripped and the
  push line is still body

### Requirement: A heredoc fed to a script reader is read as a script

Where any command in the call is `sh`, `bash`, `zsh`, `dash`, `eval`,
`source` or `.`, or is named by a path holding a `/`, the guard SHALL read
every heredoc body in that call as commands, whatever its quoting; for that
call this rule takes precedence over *A quoted heredoc's body is data* and
*An unquoted heredoc's body runs only its substitutions*. A file written any
other way, as by `printf`, stays outside the guard.

#### Scenario: A body given to a shell as its script

- **WHEN** the agent attempts `bash <<'EOF'`, with a body line
  `git push --force origin feat/x`, then `EOF`
- **THEN** the hook blocks the call

#### Scenario: A body piped into a shell

- **WHEN** the agent attempts `cat <<'EOF' | sh`, with the same body
- **THEN** the hook blocks the call

#### Scenario: A body evaluated through a substitution

- **WHEN** the agent attempts `eval "$(cat <<'EOF'`, with the same body,
  then `EOF`, then `)"`
- **THEN** the hook blocks the call

#### Scenario: A body written to a script the same call runs

- **WHEN** the agent attempts `cat > s.sh <<'EOF'`, with the same body, then
  `EOF`, then `bash s.sh`
- **THEN** the hook blocks the call, because `bash` stands in the call

#### Scenario: A body written to a script the call runs by path

- **WHEN** the agent attempts `cat > s.sh <<'EOF'`, with the same body, then
  `EOF`, then `./s.sh`
- **THEN** the hook blocks the call, because `./s.sh` is named by a path

### Requirement: A heredoc the guard cannot place fails closed

Where the delimiter line never comes, the guard SHALL read the text after
the operator as commands. A delimiter word holding `$` SHALL be matched by
its literal text, since the shell does not expand it. A delimiter word
holding a backtick or `(` outside quotes SHALL make the guard refuse the
call, since the
guard cannot tell where that word ends, and reading the body as commands
lets a quote in it hide what follows. `<<` inside `$((…))` or `((…))` is a
shift, and `<<<` is a here-string, so neither SHALL start a body.

#### Scenario: A delimiter that never comes

- **WHEN** the agent attempts `cat <<'EOF'`, then
  `git push --force origin feat/x`, with no `EOF` line
- **THEN** the hook blocks the call

#### Scenario: A delimiter holding a dollar

- **WHEN** the agent attempts `cat <<$X`, with a body line `don't`, then
  `$X`, then `git push --force origin feat/x`
- **THEN** the hook blocks the call, because the body ends at the literal
  `$X` line

#### Scenario: A delimiter holding a substitution

- **WHEN** the agent attempts `cat <<$(echo E)`, then a body line `x`
- **THEN** the hook blocks the call

#### Scenario: An arithmetic shift

- **WHEN** the agent attempts `echo $((1<<2))`, then
  `git push --force origin feat/x`, then `2`
- **THEN** the hook blocks the call

#### Scenario: A here-string

- **WHEN** the agent attempts `cat <<<x`, then
  `git push --force origin feat/x`, then `x`
- **THEN** the hook blocks the call

### Requirement: A call the scan ends inside a quote is refused

The guard SHALL refuse a call whose scan reaches the end of the text inside a
single- or double-quoted string, or inside an unclosed `$(…)` or backtick
substitution. The shell runs no part of such a call, so nothing it runs is
refused. Where only the guard sees the open quote, the guard has misread a
boundary, and the quote would hide every command after it from the guard.

#### Scenario: A stray apostrophe before a guarded command

- **WHEN** the agent attempts `echo don't`, then
  `git push --force origin feat/x`
- **THEN** the hook blocks the call

#### Scenario: An unclosed substitution

- **WHEN** the agent attempts `echo $(git status`
- **THEN** the hook blocks the call
