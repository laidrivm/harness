# settings-local-sweep — design

## Context

Claude Code saves a "Yes, and don't ask again" answer to
`.claude/settings.local.json` at the repository root, and resolves a worktree
to its main checkout, so every session in a repository feeds one file. The
permissions page of the Claude Code documentation, read on 2026-10-12, fixes
the facts the sweep relies on:

- Rules are evaluated deny, then ask, then allow; the first match decides, and
  specificity changes nothing. An allow cannot open what a deny or an ask
  matches.
- In a `Bash(...)` rule, `*` matches any sequence. A trailing ` *` that is the
  rule's only wildcard also matches the bare command, and the space before it
  is a word boundary. `:*` is the same as a trailing ` *`, but only at the end
  of a pattern.
- A bare tool name matches every use of that tool, and `Bash(*)` is the same
  as `Bash`. That equivalence is documented for Bash and not for every tool:
  `WebFetch(domain:*)`, for one, is not a bare `WebFetch`. So the sweep treats
  only `Bash(*)` as universal.
- Approving a compound command saves up to five rules, one per subcommand.
  That is where entries like `set -e` or a lone `echo` come from.

The live `agent-permissions` §*Every manifest-mutating invocation prompts*
still says the opposite of the first point: that a broader local allow
suppresses an ask. `bun-version-sites` replaces that requirement with the
documented precedence. The first scenario here depends on the corrected
reading, so this change follows that one, and `.openspec.yaml` declares it
`after: [bun-version-sites]`.

`bun/settings.ts` already decides what a machine-local allow entry is. It
looks for an absolute path token in any entry, and checks whether a `Read` or
`Edit` path resolves outside the repository. It applies that test to the
tracked allow list, inline in `settings()`.

## Goals / Non-Goals

**Goals:**

- The sweep sorts every local allow entry into one of three classes, and
  fails while anything but a machine-local entry remains.
- It uses the same machine-local test as the tracked-file check, from one
  definition.
- It runs the same way in the harness and in a consumer: from the
  repository's root, against that repository's two files.

**Non-Goals:**

- Matching `Read`/`Edit` path rules and `WebFetch` domain rules by their own
  semantics. Path rules use gitignore patterns and domain rules use
  dot-bounded wildcards. The sweep compares those entries exactly, plus the
  bare-tool rule. A local entry that a tracked path or domain glob does cover
  is therefore reported as a gap, and a person drops it. The error is in the
  safe direction: it shows an entry that could have been hidden, and never
  hides one that should be shown.
- Reading the tracked file's `additionalDirectories`, sandbox settings or
  hooks. A gap means that no tracked permission rule matches. A
  `PreToolUse` hook can still allow or block the call, and the sweep does not
  model that. The harness's own hooks only ever block.

## Decisions

### A command of its own, not a second reader in the policy check

The card left this open: either the fixture that pins the policy also reads
the local file, or the sweep becomes a separate check. It becomes a separate
command, `bun/settings-local.ts`, and stays out of `bun/check.ts`'s `run`.

- §*The permission policy is pinned by a test* says that check MUST read the
  tracked file and never the local one. A second reader would amend that
  requirement and gain nothing for it.
- `check.ts` runs in CI and in clones, and neither has a local file. A sweep
  there would pass on an absent input every time it ran where it is enforced.
  That is the pass on a missing or local slice that the requirement's "never"
  was written against.
- The file exists only on the user's machine. So the sweep is something a
  person or a scheduler on that machine runs, and the hygiene-audits card
  decides which.

*Alternative considered:* a `bun test` case that skips itself when the file is
absent. It fails only for the author, so a push could be refused over a file
nobody else can see. And it skips in CI, which is how a check comes to be
trusted without ever being run.

### Three classes, and only machine-local entries may stay

| class | what it means | what to do |
| --- | --- | --- |
| decided | a tracked deny, ask or allow entry matches it, checked in that order | drop it: the tracked file already answers |
| machine-local | `settings.ts`'s test rejects it from the tracked list | keep it: one machine is where it belongs |
| gap | none of the above | promote it to the tracked file, or drop it as a one-off |

Machine-local entries are the only ones the local file exists for. Every
other entry either repeats the tracked file or is something the tracked file
is missing. A run reports decided entries before gaps, so the free deletions
come first.

The order of the tests matters. Deny is tested before ask, ask before allow,
and all three before the machine-local test. So an entry carrying an absolute
path that a tracked rule already decides is reported as decided, and an
entry that both an ask and an allow match names the ask: that is the rule
Claude Code applies.

### Report, never rewrite

The command prints and exits. It writes neither file. Whether a gap is
promoted or dropped is the review criterion that §*The tracked allow list
holds only what a clone can use* already assigns to a person. And a tool that
deleted entries from a user's settings while unattended would be making that
decision for them. Pruning the file is done with `/permissions` or by hand.

### One machine-local test, exported from `settings.ts`

The absolute-token test and the outside-the-repository test move out of
`settings()` into one exported predicate. `settings()` and the sweep both
call it. A second copy would let the two disagree about what may stay local,
and the result would be an entry the sweep keeps that the check would also
refuse to accept as a promotion.

### Output

Decided and gap entries go to stderr, one line each. A decided line names the
local entry, its class, and the tracked entry with the list holding it. Kept
entries go to stdout. The exit code is 1 when any decided or gap entry was
reported, and 0 otherwise. If either file cannot be parsed, the command
throws and names the file, the same as `check.ts`'s inputs do. If there is no
local file, it prints one line saying there is nothing to sweep and exits 0.

### The harness's own clean-up

The criterion for promotion is what an unattended session needs to follow the
documented workflow, because there a prompt is a refusal. The evidence is the
local file and the session transcripts of the unattended run on the night of
2026-10-12.

Measured again after that run, the harness's checkout held 24 local allow
entries: 5 decided by the tracked file, 7 machine-local and 12 gaps. Three of
the seven are new `mkdir -p` grants, each naming a scratch directory. A
machine-local entry like that is one instance of a general command the
workflow needs.

Only forms the command guard can read in full are promoted: a command whose
own words say what it does.

Promoted to the tracked file:

- `Bash(bun info *)` and `Bash(bun audit *)`: the `/warm` skill's own
  procedure reads registry metadata and advisories with them.
- `Bash(git rm -- *)`: it deletes tracked files, and they are recoverable from
  git until and after the commit. The `--` form is the one promoted because
  every word after `--` is a path. That keeps out `-f`, which discards
  uncommitted edits git cannot give back, whereas `git rm *` would match
  `git rm -f x` and `git rm x -f` alike.
- `Bash(mkdir *)`: it creates directories and nothing else, and the four
  `mkdir -p` grants show it is where an unattended run stalled. Once it is
  promoted, those four read as decided.
- `Bash(bash bun/diff-budget.sh *)`: this is step 1 of the pre-PR sequence and
  the pre-push hook's own command. The harness has no `diff-budget` package
  script, so `bun run *` does not reach it.
- `Bash(bun bun/settings-local.ts)`: the sweep itself, named exactly. The
  harness's workflow runs no other `bun bun/<name>.ts` by hand. The scripts
  under `bun/` either run as hooks or are run from a consumer's tree. A
  pattern over the directory is refused, because it would run whatever file
  sits there.

The remaining gaps are dropped. The one-offs: three in-place `sed` edits of
single files, two runs of a README generator that is not in the tree, a help
call under the CodeRabbit CLI's retired short name and one under its current
name, and a lone `echo` left over from a compound command. The blanket
`python3` grant is dropped too, per *Interpreters stay behind a prompt* below.
That makes nine of the twelve gaps dropped and three promoted, `git rm` in its
narrowed form, so its broader local grant is dropped as well. The other three
promotions are commands the workflow runs, not entries the file holds.

### Interpreters stay behind a prompt

`python3`, `bun -e`, `node -e`, and `bun` or `node` given an arbitrary file,
are never promoted, whatever an unattended run stalls on. The command guard
reads only a command's words. `python3 -c "…git push --force…"` carries a
refused act past it, and past every deny entry, as text the guard never
parses, and no diff records it. An allowed interpreter is therefore a guard
bypass. The same reasoning refuses `Bash(bun *)`, which would also grant
`bun x`, a package fetched and run the way the denied `npx` runs one. The
sweep reports each such local grant as a gap, and the gap is dropped. A
scripted edit goes through the editing tool, or through a script file whose
text a reviewer can read.

Gating them with `ask` entries in the tracked policy, so that a local `allow`
cannot quietly re-grant them, is a follow-up and not part of this change.
`bun/settings.ts` compares the Bash `ask` list whole, for every consumer, so
the entries would change the shipped policy. A prefix entry also misses
spellings such as `bun --eval` and `python3 -Ic`. Closing the class is a
command-guard check, which is a gate change of its own and has to be measured
against both consumers.

## Risks / Trade-offs

- [A promotion grants more than the prompt it replaces] → each promotion is
  named in the pull request body and reviewed. The tracked-file check still
  refuses a promoted entry that re-grants a gated one.
- [Claude Code changes its matching rules] → the sweep reports a gap it should
  have decided, or the reverse. Tests pin each documented behaviour by name,
  so a change in the docs points to the case to update. Nothing here can
  observe the binary's matcher directly.
- [An unattended session still stalls on `python3` or `bun -e`] → this is the
  intended cost. In `dontAsk` mode the call is refused, and the session falls
  back to the editing tool or a script in the tree.
- [The sweep is never run] → that is the hygiene-audits card's to prevent. The
  file keeps growing exactly as it does today, and no gate is weakened.

## Migration Plan

None for consumers: the command arrives with a pin bump, and nothing runs it
for them. d2ass's and mellon's clean-ups are each a change in its own
repository, run after the bump. On the 2026-10-12 measurement, d2ass has 42
gaps and 2 decided entries; mellon has 7 gaps, 6 decided entries (one of them
gated by an ask entry) and 3 machine-local.
