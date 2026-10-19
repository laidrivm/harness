# remove-ship — design

## Context

See proposal.md, *Why*. `ship` is the only skill under `core/skills/` that
carries `disable-model-invocation`. Its merge step is the only
`(unattended: user` marker in a skill. The marker check in `bun/autonomy.ts`
fails a flagged skill with no such marker, and passes a tree with no flagged
skill at all.

## Goals / Non-Goals

**Goals:** no tracked file outside the change records names `ship` as a skill
once the change is archived.

**Non-Goals:** see proposal.md, *Non-goals*. Nothing here changes
`bun/autonomy.ts`, `core/autonomy.md` or any permission entry.

## Decisions

### D1. Delete the skill, as the user decided

The user chose option (a) on the card on 2026-10-18: delete `ship`. This is
settled and is not reopened here.

The alternative was to keep `ship` as a user-only skill linked into no
checkout. It was rejected because every step it has is either carried
elsewhere or forbidden here (proposal.md, *Why*).

### D2. Both requirements keep their text, and only their scenarios change

The flag mechanism keeps both its halves. A flagged skill is a `user` step,
in `agent-autonomy`. A flagged skill must hold a `user` step, in
`agent-permissions`. The next skill that keeps a step for the user, a merge
for example, needs both, and the marker check already enforces the second.
Removing the requirements because no skill carries the flag today would leave
that skill unchecked.

Each scenario is rewritten to describe a skill, without naming one:

- `agent-autonomy`: the scenario keeps its point. When the work needs a
  flagged skill whose step merges a pull request, the session does not merge
  by hand instead. Its heading names `/ship`, and OpenSpec refuses a MODIFIED
  block that drops a scenario's heading, in `validate` and in `archive` alike.
  So the requirement is removed and added again, as *A skill reserved for the
  user is a `user` step*, with the same text: the precedent is
  `2026-10-13-bot-reads-rulebook`. A REMOVED and an ADDED under one name are
  refused too, which is why the name changes. The alternative was to keep the
  old heading, which leaves `/ship` named in the live spec. The criterion is
  renamed, and no test cites either name.
- `agent-permissions`: the heading *A skill reserved for the user* stays, and
  only its body changes. So does the body of *A flag with no step that stays
  with the user*, which named `coderabbit/SKILL.md`; its heading, which
  `bun/autonomy.test.ts` cites, stays.

Neither scenario that named `ship` is cited by a `// spec:` comment. The
renamed criterion stays uncited, so the count of uncited criteria does not
move.

### D3. The triage clause is dropped, not reworded

`core/skills/triage/SKILL.md` says the gate line's prefix "is what `ship`
files it under". Nothing else files the prefix, and the paragraph's last
sentence already says why the line can be checked mechanically. So the clause
goes, and nothing replaces it.

### D4. The live specs change at archive

The delta specs carry the rewritten scenarios, and `/opsx:archive` syncs them
into `openspec/specs/`. Until then, the live specs keep naming `/ship`, and
the implementation's grep leaves `openspec/` out. This change's archive is
what makes those two sites true.

## Risks / Trade-offs

- [A consumer links `.claude/skills/ship`, and the link dangles once its pin
  moves past this change] → No such link was found in `d2ass` or `mellon` on
  2026-10-18. `bun/check.ts` reports a dangling skill link in a consumer, so
  one added later fails loudly rather than silently.
- [The three-round cap and `--match-head-commit` are lost along with the
  skill] → Both are recorded on their own cards (`reviewdocs`, `autoapprove`)
  before this change merges. The parent session writes those cards.
