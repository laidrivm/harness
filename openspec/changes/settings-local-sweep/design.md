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
- A bare tool name, and `Tool(*)`, match every use of that tool.
- Approving a compound command saves up to five rules, one per subcommand.
  That is where entries like `set -e` or a lone `echo` come from.

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
  hooks. Only `permissions` decides whether an entry prompts.

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
  That is the stale-slice pass the fixture's comment was written against.
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

On 2026-10-12 the harness's checkout held 21 local allow entries: 5 decided by
the tracked file, 4 machine-local and 12 gaps. Three of the gaps are commands
the documented workflow runs, and they are promoted:

- `Bash(bun info *)` and `Bash(bun audit *)`: the `/warm` skill's own
  procedure reads registry metadata and advisories with them.
- `Bash(git rm *)`: removing a tracked file is part of a change just as
  `git add` and `git commit` are, and both of those are already granted.

The other nine are dropped. They are three in-place `sed` edits of single
files, two runs of a README generator that is not in the tree, a help
call under the CodeRabbit CLI's retired short name and one under its current
name, a lone `echo` left over from a compound command, and a blanket grant of
the Python interpreter. The last is never tracked policy: it is an
arbitrary-code grant that this project, which runs on bun, has no workflow
for.

## Risks / Trade-offs

- [A promotion grants more than the prompt it replaces] → each promotion is
  named in the pull request body and reviewed. The tracked-file check still
  refuses a promoted entry that re-grants a gated one.
- [Claude Code changes its matching rules] → the sweep reports a gap it should
  have decided, or the reverse. Tests pin each documented behaviour by name,
  so a change in the docs points to the case to update. Nothing here can
  observe the binary's matcher directly.
- [The sweep is never run] → that is the hygiene-audits card's to prevent. The
  file keeps growing exactly as it does today, and no gate is weakened.

## Migration Plan

None for consumers: the command arrives with a pin bump, and nothing runs it
for them. d2ass's and mellon's clean-ups are each a change in its own
repository, run after the bump. On the 2026-10-12 measurement, d2ass has 42
gaps and 2 decided entries; mellon has 7 gaps, 6 decided entries (one of them
gated by an ask entry) and 3 machine-local.
