# Design

## Context

`openspec/specs/work-finish/spec.md` is not on `main` yet: PR #338 archives
`work-finish` and syncs it. The delta's MODIFIED blocks copy #338's synced
text; whichever of the two merges second reconciles them.

## Goals / Non-Goals

**Goals:** a card-less pull request opens and goes ready through `finish`.

**Non-Goals:** guarding against an agent that drops `--card` to skip a
waiting question — the hook holds a forgotten order, not intent (stage 2,
question 23).

## Decisions

- `finish(card?, opening?)`: with no card, the ask integration is never
  loaded and `waiting()` never called, so a machine with no ask settings
  still finishes. Everything before the ready switch is unchanged.
- The spec's *No card* scenario, which pinned the old refusal, becomes *A
  malformed card*, the case the test table already holds.

## Risks / Trade-offs

A session that forgets `--card` marks ready past a waiting question. Accepted:
the user's call (2026-10-28), and CI plus the human merge still stand.
