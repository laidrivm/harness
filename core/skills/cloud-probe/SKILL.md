---
name: cloud-probe
description: Report, in a Claude Code cloud session or routine, whether the harness installed and its gates run — the install, the pin, origin's form, the turn gate's mark, the command guard's refusal on main, and the goal check's REST read. Changes nothing. Use as a routine's one skill call, or when asked whether the harness works in the cloud.
argument-hint: "<change slug>"
---

# Cloud probe

Report whether the harness runs in this session as it runs locally. It reads
and reports only: never commit, push, post, comment or edit a file.

## Arguments

Raw arguments: $ARGUMENTS

The one parameter is an OpenSpec change slug, used in the last item. With
none, skip that item and say so.

## Items, in order

1. `CLAUDE_CODE_REMOTE`, `bun --version`, and any lines the session started
   with that came from a hook (the cloud install's failure line, the
   stale-install notice).
2. Whether `node_modules/harness/` exists; if it does, the commit
   `node_modules/harness/.bun-tag` names, against the pin in `package.json`
   (`devDependencies.harness`, the part after `#`).
3. The form of `origin`'s URL, from `git remote get-url origin`, with any
   user or token part before `@` dropped: its host and its last two path
   segments, which the goal check's read parses.
4. Whether the turn gate's `UserPromptSubmit` half ran: whether the
   `turn-gate` directory under the temp directory (`$TMPDIR`, else `/tmp`)
   holds a file written since this session started.
5. On `main`, what `git commit --dry-run --allow-empty -m cloud-probe`
   answers. The command guard refuses any commit on `main`, so its refusal is
   the pass, and `--dry-run` creates no commit if the guard is missing.
   On another branch, name the branch and say the item was skipped.
6. The last line of `bun node_modules/harness/bun/goal-check.ts propose
   <slug>`. `no open or merged pull request for <branch>` shows the REST read
   answered; `could not be read` shows it did not.

## Output

One line per item, numbered as above, each naming what it read and whether
that is what a local session reads. Nothing else follows the six lines.
