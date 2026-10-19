# remove-ship

## Why

`core/skills/ship/` is linked into no checkout: no `.claude/skills/ship` link
exists here, in `d2ass` or in `mellon`, and no test reads the skill. Each of
its steps is either done elsewhere or forbidden here:

- the gates, the push and the pull request are the stage session's own goal
  (`bun/board-loop.ts` sets it, `bun/goal-check.ts` decides it);
- its step 4 waits for CodeRabbit in a `sleep 30` loop for up to nine
  minutes, which `core/git-and-prs.md` forbids ("Never wait on a result
  someone else produces");
- its step 5 is `/coderabbit`, which now reads the head commit's review once
  by itself;
- its step 6, the merge, stays with the user.

The user decided on 2026-10-18, on the card *Decide whether to adopt ship and
pr-brief from the skills repository*, to delete it (option (a)).

## What Changes

- **The skill goes.** `core/skills/ship/` is deleted.
- **The prose that names it goes with it:**
  - its row in the README's skill table;
  - the clause in `core/skills/triage/SKILL.md` saying the gate line's prefix
    is what `ship` files it under.
- **Two spec scenarios stop naming `ship`.** Both requirements keep their
  text, so a skill that carries `disable-model-invocation` is still a `user`
  step and still needs an `(unattended: user` step. No skill carries the flag
  once `ship` is gone, and the mechanism stays for the next one that does.
  - `agent-autonomy`'s *The work needs a merge through `/ship`* describes a
    skill reserved for the user whose step merges a pull request. The session
    does not merge by hand in its place.
  - `agent-permissions`'s *A skill reserved for the user* names no
    particular skill.

## Non-goals

- `ship` caps a pull request's review at three rounds. That cap goes to the
  `reviewdocs` card, and nothing here carries it.
- `ship` merges with `gh pr merge --match-head-commit`. That goes to the
  `autoapprove` card, and nothing here carries it.
- Archived changes, `docs/context/pipeline-yield-2026-10.md`, and the stage
  name `ship` in `bun/goal-check-io.test.ts` stay as they are. The first two
  are records, and the third is a fabricated unknown stage, not the skill.

## User acts

- Merge this proposal's pull request, and later the implementation's. The
  merge stays with the user.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-autonomy`: *A skill only the user may start is a `user` step* is
  replaced by *A skill reserved for the user is a `user` step*. The text is the
  same, and the scenario names a skill reserved for the user instead of
  `/ship`.
- `agent-permissions`: the scenario *A skill reserved for the user* under
  *Who may invoke a skill is enforced, not narrated* names no particular
  skill, and nor does its scenario *A flag with no step that stays with the
  user*, which named `coderabbit/SKILL.md`.

## Impact

- Deleted: `core/skills/ship/SKILL.md`.
- Edited: `README.md`, `core/skills/triage/SKILL.md`.
- The live specs `openspec/specs/agent-autonomy/spec.md` and
  `openspec/specs/agent-permissions/spec.md` change when this change is
  archived.
- No code, test, dependency or permission entry changes. Consumers lose
  nothing, since none links the skill.
