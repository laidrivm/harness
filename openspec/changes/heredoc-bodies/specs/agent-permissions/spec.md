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
commands. A backslash before `$` or a backtick SHALL keep it literal, as the
shell keeps it.

#### Scenario: A substitution in an unquoted body

- **WHEN** the agent attempts `cat <<EOF`, with a body line
  `$(git push --force origin feat/x)`, then `EOF`
- **THEN** the hook blocks the call

#### Scenario: A backtick substitution in an unquoted body

- **WHEN** the body line is `` `git push --force origin feat/x` `` instead
- **THEN** the hook blocks the call

#### Scenario: A plain line in an unquoted body

- **WHEN** the agent attempts `cat <<EOF`, with a body line
  `git push --force origin feat/x`, then `EOF`
- **THEN** the hook allows the call

### Requirement: A heredoc body ends where the shell ends it

The guard SHALL start a body after the next unquoted newline at the
operator's own substitution level. A newline inside `( … )` starts it, and
one inside `$(…)` or backticks does not. The body SHALL end at the first
line equal to the delimiter, with leading tabs stripped for `<<-`, or equal
to it once joined to lines before it ending in a backslash. The guard SHALL
read every command after that line.

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
  `F` into the delimiter

#### Scenario: A space-indented delimiter under the dash form

- **WHEN** the agent attempts `cat <<-'EOF'`, then `  EOF` indented by
  spaces, then `git push --force origin feat/x`, then `EOF` indented by a tab
- **THEN** the hook allows the call, because only tabs are stripped and the
  push line is still body

### Requirement: A heredoc fed to a script reader is read as a script

Where any command in the call is `sh`, `bash`, `zsh`, `dash`, `eval`,
`source` or `.`, the guard SHALL read every heredoc body in that call as
commands, whatever its quoting. A file a heredoc writes and the call then
runs by path is outside the guard, as a file written any other way is.

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

### Requirement: A heredoc the guard cannot place is read as commands

Where the guard cannot place a body, it SHALL read the text after the
operator as commands. That covers a delimiter line that never comes, and a
delimiter word holding `$`, a backtick or `(`. `<<` inside `$((…))` or
`((…))` is a shift, and `<<<` is a here-string, so neither SHALL start a
body.

#### Scenario: A delimiter that never comes

- **WHEN** the agent attempts `cat <<'EOF'`, then
  `git push --force origin feat/x`, with no `EOF` line
- **THEN** the hook blocks the call

#### Scenario: An arithmetic shift

- **WHEN** the agent attempts `echo $((1<<2))`, then
  `git push --force origin feat/x`, then `2`
- **THEN** the hook blocks the call

#### Scenario: A here-string

- **WHEN** the agent attempts `cat <<<x`, then
  `git push --force origin feat/x`, then `x`
- **THEN** the hook blocks the call
