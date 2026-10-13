# settings-local-sweep — tasks

One task group, so this change ships whole on `feat/settings-local-sweep`.

The numbers in parentheses are the edge cases `/zombies` listed against the
proposal. Each one is a case of its own in `bun/settings-local.test.ts`,
over fabricated repositories made the way `bun/settings.test.ts` makes them.

## 1. The sweep, and the harness's own clean-up

Closes `agent-permissions/an-entry-the-tracked-file-already-decides`,
`agent-permissions/a-gap-in-the-tracked-policy`,
`agent-permissions/nothing-left-to-promote-or-drop`.

- [x] 1.1 Write the failing cases first, then confirm each one fails because
      the module does not exist yet. Cite each criterion in a `// spec:` line
      above the case that closes it. Cover the empty inputs (1, 2, 3); one
      entry of each class (4, 5, 6); the order of the lists: deny before allow,
      ask before allow, and every class in one file (7, 8, 9); the
      documented matching (10–14); and an entry of another tool with the
      same argument text (15)
- [x] 1.2 Add the cases that keep the matcher literal and the order honest.
      An entry carrying `:`, `$`, `?`, `"` or `-` matches only itself and
      throws nothing (16). A `Read(../…)` entry with no absolute token is kept
      (17). An entry with an absolute path that a tracked rule decides is
      reported as decided (18)
- [x] 1.3 Move the machine-local test out of `settings()` in
      `bun/settings.ts` into one exported predicate, which `settings()` calls.
      Verify that `bun/settings.test.ts` passes unedited, and add the case
      showing the sweep keeps exactly what that predicate rejects (20)
- [x] 1.4 Write `bun/settings-local.ts` per design §*Three classes* and
      §*Output*: tests run deny, ask, allow and then machine-local; a decided
      line names the tracked entry and its list (19); a file that does not
      parse throws and names the file (22, 23); and an absent local file
      exits 0. Verify that 1.1 and 1.2 pass
- [x] 1.5 Assert that neither file's bytes change across a run that reports
      entries (24). Assert that `bun/check.ts`'s `run` returns the same
      problems for a fabricated consumer with and without a local file full
      of gaps (21)
- [ ] 1.6 Add one bullet to the README's *Consuming* list, beside `check.ts`.
      It names the command and says it runs only where the local file
      exists, which is never a clone or CI. It does not name the
      hygiene-audits card, because a board is private and the README is
      not. Verify by running the bullet's own command from the harness root
- [ ] 1.7 Run the sweep against the harness's main checkout and compare its
      classes with design §*The harness's own clean-up*. Where the file has
      changed since 2026-10-12, decide each new gap by the same criterion.
      Promote the chosen entries into `.claude/settings.json`. Verify that
      `bun test` passes and that a rerun reports the `mkdir -p` grants as
      decided. In the pull request body, name each promotion and
      the largest dropped group, per §*The tracked allow list holds only what
      a clone can use*, and give classes and counts only. The local file is
      machine-local and none of its entries are quoted beyond those promoted
- [ ] 1.8 Measure `bun/settings.ts`, `bun/settings-local.ts` and
      `bun/settings-local.test.ts` against the 300-line cap and record the
      three numbers in the pull request body
- [ ] 1.9 Search the four places that restate a decision for any sentence
      saying the local file is unread or unmeasured, and reconcile each: the
      change's sibling artefacts, `openspec/specs/**`, the board cards and
      the README ownership map. The settingslocal card and the hygiene-audits
      card are two of them
- [ ] 1.10 By hand, after the merge: the user prunes the harness's local file
      to its machine-local entries, and the sweep run from the main checkout
      exits 0 (25). File one card each on the `D2ASS` and `mellon` boards for
      that repository's clean-up, to follow its next pin bump. File one card
      on the `Harness` board for the follow-up that design §*Interpreters
      stay behind a prompt* names
