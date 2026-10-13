# heredoc-bodies — tasks

This change has one task group, so it ships whole on `feat/heredoc-bodies`.

## 1. The scanner reads a heredoc as the shell does

Closes `agent-permissions/a-pull-request-body-naming-a-push`,
`agent-permissions/every-quoting-of-the-delimiter`,
`agent-permissions/a-substitution-in-an-unquoted-body`,
`agent-permissions/a-backtick-substitution-in-an-unquoted-body`,
`agent-permissions/a-plain-line-in-an-unquoted-body`,
`agent-permissions/a-quote-character-in-a-body`,
`agent-permissions/two-heredocs-on-one-line`,
`agent-permissions/a-newline-inside-a-substitution-on-the-operator-s-line`,
`agent-permissions/a-delimiter-split-by-a-backslash-newline`,
`agent-permissions/a-space-indented-delimiter-under-the-dash-form`,
`agent-permissions/a-body-given-to-a-shell-as-its-script`,
`agent-permissions/a-body-piped-into-a-shell`,
`agent-permissions/a-body-evaluated-through-a-substitution`,
`agent-permissions/a-body-written-to-a-script-the-same-call-runs`,
`agent-permissions/a-body-written-to-a-script-the-call-runs-by-path`,
`agent-permissions/a-delimiter-that-never-comes`,
`agent-permissions/an-arithmetic-shift`, `agent-permissions/a-here-string`,
`agent-permissions/two-backslashes-before-a-substitution`,
`agent-permissions/a-split-delimiter-under-a-quoted-one`,
`agent-permissions/a-split-delimiter-that-dash-reads-past`,
`agent-permissions/a-delimiter-holding-a-dollar`,
`agent-permissions/a-delimiter-holding-a-substitution`,
`agent-permissions/a-stray-apostrophe-before-a-guarded-command`,
`agent-permissions/an-unclosed-substitution`.

- [ ] 1.1 Write the failing cases first in a new
      `bun/command-parse-heredoc.test.ts`, driven through the guard with
      `command-guard.fixture.ts` as `bun/command-parse.test.ts` drives its
      cases. Give each scenario above one case citing it with `// spec:`.
      Build the commands with `\n` and `\t` escapes, never multi-line
      templates, as `spec-coverage.ts` asks. Record which cases fail against
      the guard as it stands: every allow case, and the quote-character
      case, which the probe shows passing today. The controls already block
      and must stay blocking.
- [ ] 1.2 Add the cases the scenarios do not pin, each its own test:
      `<<"EOF"` and `<<E"O"F` each alone; `2<<'EOF'` in front of the command,
      so the fd does not become the command name; `<<- EOF` with a space
      before the delimiter; a `\$(` in an unquoted body, which stays literal;
      a `#` comment holding `<<EOF`, which opens nothing; `<<EOF` inside
      double quotes, which opens nothing; `(( x = 1 << 2 ))`; a heredoc inside `$(…)`
      whose body closes before the `)`; and the subshell case from design D3,
      `cat <<'EOF' && (true⏎body⏎EOF⏎)⏎git push --force origin feat/x⏎EOF`,
      which must block. Confirm each passes or fails for the reason its name
      gives.
- [ ] 1.3 Add the edge cases `/zombies` raised at the proposal stage, each
      its own test:
      - an empty quoted body, with the line after the delimiter still read
      - `cat <<` with no delimiter word before the newline, read as today
      - a quoted and an unquoted heredoc on one line, where the second body's
        `$(…)` blocks
      - a delimiter line `EOF` followed by one blank, which does not end the
        body
      - a body line `EOFX`, which does not end the body
      - an unclosed quote in the delimiter word (`cat <<'EOF`)
      - an unclosed `$(` in an unquoted body
      - `git commit -F - <<'EOF'` on `main`, which still blocks as
        `main-commit`

      Assert the exit code is 2 in the two unclosed cases, as design D10
      refuses them. Any other code is a crash or a pass, and Claude Code
      reads a crash as allowing the call.
- [ ] 1.4 Add `bun/command-heredoc.ts` with the delimiter reader and the body
      collector as pure functions over the source text, per design D2, D6
      and D8. Each reads the text from the source at the offset the scan
      reached. Verify with `bun test bun/command-parse-heredoc.test.ts` once
      1.5 wires them in.
- [ ] 1.5 Carry the heredoc state in `commands()` in `bun/command-parse.ts`.
      Recognise `<<` and `<<-` outside quotes, comments and arithmetic, and
      consume `<<<` whole first. Refuse the call when the scan ends inside a
      quote or an open substitution (D10), with its own ledger id, and say
      in the reason which state remains open. Drop the operator,
      its delimiter and a
      digits-only fd from the words (D7). Keep the pending list on the frames
      `$(` and backticks suspend and off the ones `(` suspends (D3). Mark
      arithmetic frames (D6). Place each body at the separating newline,
      scan an unquoted body in body mode (D5), and apply the script-reader
      pass over the finished command list (D4). Rewrite the doc comment on
      `commands()` to name every state it carries, the heredoc included.
      Verify that 1.1 to 1.3 pass and that `bun test` passes whole.
- [ ] 1.6 Measure `bun/command-parse.ts`, `bun/command-heredoc.ts` and the
      new test file against the 300-line cap: run `wc -l` on the three, and
      `bun test bun/file-size.test.ts` to confirm the gate's own reading. If
      one is over, split it in this step. Record the three counts in the pull
      request.
- [ ] 1.7 Re-run the probe table in `proposal.md`, Why, against the built
      guard, and record the column it now gives in the pull request. The
      first row must read exit 0, and the other four exit 2.
- [ ] 1.8 Search the four places that restate a decision for any sentence
      saying a heredoc body is read as commands, or that `commands()` carries
      only quotes, comments and substitutions: the change's sibling
      artefacts, `openspec/specs/**`, the cards on the boards, and the README
      ownership map. Reconcile each one, or name the change that will.
