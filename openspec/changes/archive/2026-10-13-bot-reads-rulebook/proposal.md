# bot-reads-rulebook

## Why

`core/rules.md` §*The loop* tells an agent that a rule in the rulebook *or in
the docs it indexes* is read back by the next review, "since
`.coderabbit.yaml` points `code_guidelines` at both `**/CLAUDE.md` and
`docs/*.md`". In the harness that is false on both counts: there is no
`.coderabbit.yaml`, and the docs sit in `core/`, not `docs/`. CodeRabbit
reviews every harness pull request on its defaults, which read `CLAUDE.md`
and nothing it imports, so `core/rules.md` and the eight docs beside it never
reach the bot that reviews changes to them. Locally, `/coderabbit-local`
passes `--config .coderabbit.yaml CLAUDE.md`, and with no config that leaves
`CLAUDE.md` alone. The loop on the Harness board opens pull requests that this
bot reviews without the harness's rules — the risk the card names is damaging
the harness itself.

The sentence is false in a consumer too. It ships to every consumer as
`harness/rules.md`: d2ass's config names `harness/*.md` beside `docs/*.md`,
and mellon has no `.coderabbit.yaml` at all.

The closest existing artefact is `openspec/specs/local-review-loop`
§*The local reviewer is aligned with the PR bot*, which this change replaces.
The closest card is the Harness board's *Route a captured rule to the cheaper
of its two homes*. It asks for one delta to §*A justification survives only
when it is a convention*, whose reason routes every captured rule into
`CLAUDE.md`. This change has to modify that requirement anyway, because the
rules it names have moved to `core/rules.md`. It therefore carries that
card's delta, and the card has nothing left of its own. d2ass's
`.coderabbit.yaml` is the nearest config, and this change copies only its
`code_guidelines` decision.

## What Changes

- A root `.coderabbit.yaml` names `core/*.md` under
  `knowledge_base.code_guidelines.filePatterns`. CodeRabbit adds configured
  patterns on top of its defaults, so `**/CLAUDE.md` stays read without being
  named again.
- A test reads that config where the bot reads it and fails when the rulebook,
  or a doc it or `CLAUDE.md` links, falls outside every configured pattern, or
  when a pattern matches no tracked file.
- The `core/rules.md` sentence, and the README line saying a consumer's review
  bot reads `harness/`, stop naming globs. They say instead what holds in
  every tree: a rule is read back wherever the repository's
  `.coderabbit.yaml` names the paths its rulebook and docs sit at.
- `/coderabbit-local` passes the files those patterns match, after
  `.coderabbit.yaml` and `CLAUDE.md`, so the local review reads the rules the
  PR bot reads.

## Non-goals

- **Tuning the bot beyond what the rulebook describes.** Profile, path
  filters, `learnings.scope`, `mcp.usage` and path instructions all sit in
  d2ass's config. Each is a decision of its own, and none is needed for the
  bot to read the rules.
- **Checking a consumer's config.** A check in `bun/check.ts` that a
  consumer's `.coderabbit.yaml` names `harness/*.md` would fail on mellon
  today. It is a new gate, and it belongs to its own card.
- **Giving mellon a `.coderabbit.yaml`.** That belongs to the `mellon` board.
- **Reviewing the skills under `core/skills/`.** They are prompts, not rules,
  and the flat glob leaves them out on purpose.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-review-loop`: gains the requirement that the harness's bot config
  reaches its rulebook. *The local reviewer is aligned with the PR bot* is
  removed: it settles the invocation with a check that CLI 0.7.0 cannot
  answer. A new requirement prescribes the invocation instead, guideline files
  included. The justification requirement points at the rulebook and the docs it indexes,
  rather than at a `CLAUDE.md` list the rules have left.

## Impact

- `.coderabbit.yaml` — new, at the root. The harness sets no
  `harness.rootFiles`, so no root-layout exemption is involved.
- `bun/review-config.ts` and `bun/review-config.test.ts` — new.
- `core/rules.md`, `README.md`, `core/review-toolkit.md` — one sentence each.
  `core/rules.md` reaches consumers through `sync.ts` on their next bump.
- `core/skills/coderabbit-local/SKILL.md` — step 2's invocation, and
  `git ls-files` in `allowed-tools`.
- No dependency and no workflow change.
