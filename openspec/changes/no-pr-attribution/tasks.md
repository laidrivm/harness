# no-pr-attribution — tasks

One group, shipped whole on `fix/no-pr-attribution`, which carries this
change and its apply together. The numbers in brackets are this change's
`/zombies` ideas, marked `[zn]` in the test files. The tests are written
before the code they cover (`core/testing.md`).

## 1. Fix `attribution` in the policy, the sync and the harness's own file

- [ ] 1.1 In a new `bun/settings-attribution.test.ts`, over the fabricated
      consumer of `bun/settings.fixture.ts`, write the cases:
      - no `attribution` key is named [z1] —
        `// spec: agent-permissions/a-consumer-without-the-setting`;
      - `commit: ""` added is named [z6], and `attribution: false` is named
        [z7] — `// spec: agent-permissions/a-consumer-that-hides-the-commit-trailer-too`;
      - `pr` as a single space [z4], `sessionUrl` left out [z5] and
        `sessionUrl` as the string `"false"` [z8] are each named;
      - the two keys in reverse order report nothing [z3] —
        `// spec: agent-permissions/the-same-value-with-its-keys-in-another-order`;
      - this repository's `.claude/settings.json` holds the exported value
        [z9] — `// spec: agent-permissions/the-harness-s-own-settings`.
      Add the value to `policy()` in `bun/settings.fixture.ts`, so the
      existing "reports nothing" case covers [z2].
      Verify: `bun test bun/settings-attribution.test.ts` fails on the
      missing export, then on every case but [z3].
      (Req: agent-permissions — Claude Code adds no attribution to a pull
      request body)
- [ ] 1.2 In `bun/sync-settings.test.ts`, write the cases: no `attribution`
      comes out as the harness's value with the check passing [z10], and one
      carrying `commit` comes out without it [z11] —
      `// spec: harness-updates/a-consumer-adopts-the-attribution-setting-through-the-sync`.
      Verify: both fail.
      (Req: harness-updates — Sync writes every value the policy check
      dictates)
- [ ] 1.3 In `bun/settings.ts`, export `ATTRIBUTION` and name a settings
      file whose `attribution` does not `Bun.deepEquals` it (design.md D1).
      In `bun/sync-settings.ts`, write it whole. Set it in
      `.claude/settings.json`.
      Verify: `bun test` passes whole, the existing second-sync case [z12]
      included.
- [ ] 1.4 Say in `core/git-and-prs.md` which setting removes the footer, and
      that a commit keeps its trailer.
      Verify: `bun test` passes.
