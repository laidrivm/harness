# gh-api-guard — tasks

Three steps, so this change ships as three pull requests on
`feat/gh-api-guard-1`, `-2` and `-3`, in that order.

The delta modifies one requirement whole, so it carries four criteria this
change does not close — they describe the subcommand pair list, which is
untouched: `the-agent-tries-to-reply-to-a-review`,
`a-denied-command-hidden-in-a-compound-command`,
`opening-a-pull-request-still-works` and `reading-a-pull-request-still-works`.
Step 1's task 1.5 asserts they still hold, which is a regression check rather
than a closure.

## 1. The method tells a read from a write

Closes `agent-permissions/a-comment-posted-through-the-endpoint`,
`agent-permissions/reading-through-the-endpoint-still-works`,
`agent-permissions/a-read-that-carries-parameters`.

- [ ] 1.1 Write the failing cases first, in `scripts/command-guard.test.ts`
      beside the existing `gh` block, and record that each fails against the
      guard as it stands: `gh api -X POST /repos/o/r/issues/37/comments -f
      body=hi` blocks; `gh api "repos/o/r/pulls/37/comments?per_page=100"
      --paginate` passes; `gh api -X GET /search/issues -f q=repo:o/r` passes.
      The first is the probed hole and fails today at exit 0; the two reads
      pass today and are the control that the new test did not simply block
      the command (ZOMBIES 2, 3, 6)
- [ ] 1.2 Add the method test inside the `name === "gh"` branch, after the
      `GH_WRITES` pair search and before its `continue`. Read `--method` and
      `-X` in both the separated and the `=` spellings, compare the value
      case-insensitively, and treat `GET` and `HEAD` as a read whatever else
      the call carries (ZOMBIES 7, 8)
- [ ] 1.3 Cover the spellings the comparison must not miss, each as its own
      case: `--method` and `-X`; a lower-case `-X get`; a method flag written
      after the path; and `-X PATCH`, `-X PUT` and `-X DELETE`, so the test
      reads as a method test rather than a POST test (ZOMBIES 9, 10)
- [ ] 1.4 Make the refusal name `gh api` and the flag that decided it, and
      assert that text rather than only the exit code — an author who meant to
      read has to see which flag to drop. Assert the exit code is 2, the only
      code Claude Code reads as a block (ZOMBIES 12, 13)
- [ ] 1.5 Assert the four carried criteria still hold, unedited: the three
      subcommand writes still block and `gh pr view 37 --json state` still
      passes. This task closes no criterion — it is the control that the new
      branch left the pair list alone (ZOMBIES 21)

## 2. A parameter implies a write, and `graphql` is one regardless

Closes `agent-permissions/a-write-with-no-method-flag`,
`agent-permissions/a-graphql-call`.

- [ ] 2.1 Write the failing cases first and record that each fails: `gh api
      /repos/o/r/issues/37/comments -f body=hi` blocks; `gh api graphql -f
      query=mutation{…}` blocks; `gh api graphql -f query=query{…}` blocks
      (ZOMBIES 14, 15)
- [ ] 2.2 Add the second clause — no method flag and any of `-f`, `-F`,
      `--field`, `--raw-field`, `--input` present — quoting `gh api --help` at
      the line for why, since the default method is what makes this a write
      and nothing in the command says so (ZOMBIES 11, 16)
- [ ] 2.3 Add the `graphql` operand refusal, with the reason at its line: the
      operation sits inside an argument's value, and reading it is parsing to
      decide whether to block (ZOMBIES 14, 15)
- [ ] 2.4 Add a case for a flag the list does not name, asserting it blocks
      when no method is present — the test is scoped by the reads it exempts,
      not by the writes it enumerates, per `CLAUDE.md` (ZOMBIES 17)
- [ ] 2.5 Cover the reach the branch inherits rather than earns, each as its
      own case: an absolute path to `gh`, a `bash -c` wrapper, a compound
      command whose second half is the write, and a global flag in front of
      the operand (ZOMBIES 4, 5, 18, 19, 20)
- [ ] 2.6 Add the bare-path read as a case of its own — `gh api /repos/o/r`
      with no flags at all — so the default-`GET` path is asserted and not
      merely implied by the `--paginate` case (ZOMBIES 1)

## 3. The prose narrows to what the mechanism does not cover

This step closes no acceptance criterion: it reconciles prose and measures,
and no criterion in any capability states what a doc sentence says.

- [ ] 3.1 Narrow `docs/git-and-prs.md`'s prohibition to what the guard still
      does not reach — a tracker, a forum, any service that is not GitHub —
      per `openspec/specs/agent-rulebook` §*A mechanised prohibition leaves its
      prose home*, which calls this the partly-covered case
- [ ] 3.2 Re-run the probe table in `proposal.md` §Why against the built
      guard and record the new column, so the change's own evidence is
      measured after rather than quoted from before
- [ ] 3.3 Confirm the `coderabbit` skill's three `gh api` reads pass the guard
      by running each through it, rather than reasoning from the clause — the
      skill is untracked here, so name the three commands in the record
- [ ] 3.4 Measure `scripts/command-guard.ts` and
      `scripts/command-guard.test.ts` against the 300-line cap and record both
      numbers, whether or not either is over; the test file stood at 214 and
      the guard at 246 when this was proposed
      (*change-slicing/a-file-over-the-cap*)
- [ ] 3.5 Search the four places that restate a decision — the change's sibling
      artefacts, `openspec/specs/**`, the cards on the boards and the README
      ownership map —
      for a sentence saying the guard blocks three `gh` writes, and reconcile
      each or name the change that will
