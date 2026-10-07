# repoint-moved-changes — design

## Context

The inventory, taken on this tree, is ~190 lines across the seven changes.
Every gate a change names already exists in `bun/` under the same basename,
and the moved docs sit in `core/` under theirs. Three kinds of mention cannot
be mapped by basename: `docs/testing.md`, which was split, `CLAUDE.md`, whose
rules were split between `core/` and d2ass, and paths that never moved. See
proposal.md for why.

## Goals / Non-Goals

**Goals:**

- A check anyone can rerun that says the work is complete, without re-deriving
  the inventory.

**Non-Goals:**

- A script that rewrites the paths. The mechanical part is a handful of
  basenames, and the rest needs a reading.

## Decisions

### Each mention is resolved by where its file lives now

| mention | goes to |
| --- | --- |
| `scripts/<gate>.ts`, its tests and fixtures | `bun/<gate>.ts` — every one exists |
| a file a change creates (`tracked`, `branch-state`, `turn-gate`, their tests) | `bun/` |
| `scripts/diff-budget.sh` | `bun/diff-budget.sh` |
| `docs/{git-and-prs,review-toolkit,feature-workflow}.md` | `core/` |
| `docs/testing.md` on TDD for edge cases, `test.each`, one arrange per test | `core/testing.md` |
| `docs/testing.md` §The mutation floor | stays, *in d2ass* |
| `CLAUDE.md` citing a rule now in the rulebook | `core/rules.md` |
| `CLAUDE.md` on `trustedDependencies` | `core/code-style.md` |
| `CLAUDE.md` forbidding `src/model.ts` to import `src/app/**` | stays, *in d2ass* |
| `checks/agent-permissions-prompts.test.ts` | `bun/settings.test.ts` |
| `src/**`, `stryker.config.json`, `checks/container-image.test.ts` | stay, *in d2ass* |

Which `CLAUDE.md` mention is which is decided by finding the cited rule's
wording in `core/` — the rule is quoted beside most of them — never by the
change it sits in.

*Alternative considered.* `sed 's#scripts/#bun/#'` across the changes. Rejected
in the card: half the non-`scripts/` mentions stay d2ass's, and a replacement
that turns `checks/container-image.test.ts` into a harness path would invent a
file.

### A d2ass path is marked on its own line

A path that stays d2ass's carries the words *in d2ass* on the same line as the
path, rewrapping where needed. The completion check is then a grep over lines:

```
git grep -nE "(scripts|docs|checks|src)/|CLAUDE\.md|stryker" openspec/changes/ \
  ':!openspec/changes/archive' ':!openspec/changes/repoint-moved-changes'
```

and each hit either names a file that exists here or carries *in d2ass*.

*Alternative considered.* A marker once per paragraph. Rejected: it makes the
check a reading again, which is what the card's original criterion
(`scripts/|docs/` only) got wrong — it missed `CLAUDE.md`, `checks/` and
`src/` altogether.

### `bun-version-sites` keeps its name and loses its subject

What stays is the `agent-permissions` delta and the task widening its alias
clause, now confirmed against `bun/settings.ts`. Everything about the version
sites — tasks 1.x, 2.x, 3.1–3.3, the `toolchain-pins` delta, the design's
reading of `Dockerfile`, workflows and `dependabot.yml` — moves to a `D2ASS`
card, written from those artefacts before they are deleted here.

*Alternative considered.* Renaming the change to what it now does. Rejected:
the `Harness` card and the extract-harness archive name it, and a rename is
one more reference to chase for a change that will be a single delta. The
proposal's Why is rewritten to say the change was cut and where the rest went.

### `tracked-file-sweep`'s placement decision is rewritten, not re-pointed

Its argument was about d2ass's directories: `src/app/module-classes.test.ts`
already imports `../../scripts/scan.ts`, so a test under `src/app/` importing a
script was an established direction. Here the module is `bun/tracked.ts`
beside `bun/scan.ts`, and the callers in `src/app/` are d2ass's, reaching it
through `node_modules/harness/bun/` at the pinned commit. The decision says
that; the rejected `src/shared/` alternative is dropped, since it was a d2ass
directory. Task 2.3 moves to the `D2ASS` card, to be done in the pull request
that bumps the pin to the commit implementing the rest, per D9.

## Risks / Trade-offs

- **A cited rule's wording in `core/` drifted from the quote in the change.**
  → Resolve by the rule's meaning and requote it from `core/` — the rulebook's
  current wording is what an implementer will read.
- **Cutting `bun-version-sites` loses reasoning the `D2ASS` card does not
  carry.** → The card links the harness commit that deleted the artefacts, so
  the design and the `toolchain-pins` delta are recoverable as written.
