# tracked-file-sweep — tasks

Two groups, so this change ships one pull request per group in the order below:
`feat/tracked-file-sweep-1`, then `-2`. Split because the capability carries
four acceptance criteria and a step takes one to three. The seam is a caller,
not a stub: group 1 switches `bun/no-suppressions.ts` to the sweep, so the
module ships with a shipped path calling it, as `change-slicing` requires, and
group 2 is where the tree stops holding the other six listings.

## 1. The sweep, its three behaviours and its first caller

Closes *A check run from a subdirectory*, *A tracked file absent from the work
tree* and *A repository path ending in a space*.

- [x] 1.1 Recount the copies before writing any of them. This change's own
      prose says seven, `PLAN.md` said three, and an earlier draft of this
      change said five; take the count by searching for `ls-files` alone over
      tracked `.ts`/`.tsx` — not for `show-toplevel`, which
      `checks/readme-map.test.ts` (in d2ass) never invokes and which is how
      that site went uncounted twice — and reconcile it against all three
      figures. Separate enumerations from the named-path query in
      `bun/settings.ts`, which is not a copy. An eighth that arrived since is
      the case this task exists for (*all three*). Measured 2026-10-18 at
      `acfa023`: `ls-files` appears in nine call sites in this tree (its
      other hits are comments). Of the proposal's seven, the three script
      copies stand here — `bun/no-suppressions.ts`, `bun/spec-coverage.ts`,
      `bun/file-size.ts` — and are the three `PLAN.md` counted; the three in
      d2ass are outside this tree; and `bun/file-size.test.ts`'s inline
      enumeration is gone, dropped with its case in `6c7f5c3` when the gates
      were copied here, leaving only the comment at line 217. Arrived since,
      and named in no task: `bun/repo-layout.ts` (`stray()`, the full
      four-step copy), `bun/review-config.ts` (`unreached()`, path-only, root
      passed in), and `bun/check.ts` (`ls-files -s -z -- <dir>`, which names a
      directory and reads the mode the sweep does not return). Two more
      enumerate a fabricated repository in a test — `bun/repo-layout.test.ts`
      (`listing()`) and `bun/spec-coverage-sweep.test.ts` (`ls-files
      node_modules`, a directory operand). `bun/settings.ts` is the
      named-path query, but its `**/.npmrc` operand is a glob, which the
      requirement's last paragraph counts as enumerating; 2.5's matcher has to
      settle that. `show-toplevel` alone, taking only the root, also appears in
      `bun/root.ts`, `bun/board-loop.ts`, `bun/bump.ts`, `bun/goal-check.ts`,
      `bun/pre-pr.ts`, `bun/sync.ts`, `bun/turn-gate.ts`,
      `bun/goal-check-io.test.ts` and `bun/goal-check.fixture.ts` — none of
      them lists the tree
- [x] 1.2 Write the sweep in `bun/tracked.ts` as `tracked(cwd?)` returning
      `{ root, paths, files }` — the root, every tracked path relative to it,
      and the subset of those that are regular files —
      with the three reasons carried as comments: the listing taken at the root
      and not `cwd`, only git's terminator stripped and not `trim()`, and why a
      caller that opens what it reads takes the filtered view (*all three*)
- [x] 1.3 Test it in `bun/tracked.test.ts`, one case per criterion, each
      with its `// spec:` citation: run from a subdirectory it still lists the
      whole repository with root-relative paths (*A check run from a
      subdirectory*); a tracked path deleted from the work tree is absent from
      the filtered view and present in the unfiltered one (*A tracked file
      absent from the work tree*); a repository whose path ends in a space
      keeps the space (*A repository path ending in a space*). Fabricate the
      repository — the last case cannot be observed in this one. The absent
      case also holds a symlink and a gitlink, the other two the criterion
      names. Break-checked: `trim()` in place of the terminator strip fails the
      space case, and the listing taken at `cwd` fails the subdirectory case
- [x] 1.4 Switch `bun/no-suppressions.ts`. Run the gate before and after
      and record that it reports the same findings on today's tree. Its comment
      says "an ignored or untracked file cannot fail a clone that does not have
      it", which conflates the two — an ignored file that is tracked is in
      every clone; correct it to name untracked files while the line is open
      (*A second listing is introduced*). Recorded: this tree's
      `package.json` holds no `harness.suppressions`, so the command exits 1
      on the same `config.ts` error before and after; `scan(undefined, {})`
      reports 0 findings before and after, and 0 from `bun/` after; the 26
      cases of `bun/no-suppressions.test.ts` pass before and after
- [x] 1.5 Measure `bun/tracked.ts`, `bun/tracked.test.ts` and
      `bun/no-suppressions.ts` against the 300-line cap and record the numbers
      (*change-slicing/No source file exceeds its per-file cap*). Measured:
      44, 102 and 121 lines (`bun/tracked.test.ts` grew from 86 with the three
      `/zombies` cases); `oversize()` reports nothing

## 2. Six more call sites and no eighth

Closes *A second listing is introduced*.

- [ ] 2.1 Switch `bun/spec-coverage.ts` — `check()`'s root and `tests()`'s
      listing are the same sweep. Record the uncited count before and after; it
      does not move (*A second listing is introduced*)
- [ ] 2.2 Switch `bun/file-size.ts`. Record the file count it measures
      before and after (*A second listing is introduced*)
- 2.3 Switching `src/app/module-classes.test.ts` (in d2ass) and
  `src/app/styles/styles.test.ts` (in d2ass) is d2ass work, done in the pull
  request that bumps the pin past group 2 — the `D2ASS` card *Reconcile the
  bun version sites* carries it, assertion counts included
- 2.4 Switching the path-only caller `checks/readme-map.test.ts` (in d2ass)
  to `paths` is d2ass work on the `D2ASS` card with 2.3: it takes no root
  today and so escaped both earlier counts. It applies no `lstatSync` filter,
  on purpose — a tracked path deleted from the work tree still carries a map
  row to satisfy — so the switch confirms the row resolutions it asserts are
  unchanged. `bun/file-size.test.ts`'s inline copy, once named here, is gone
  (1.1)
- [ ] 2.4a Switch the two copies that arrived since the proposal, which 1.1
      found: `bun/repo-layout.ts` (`stray()`, the full four-step copy) to the
      sweep, and `bun/review-config.ts` (`unreached()`, path-only, root passed
      in) to `paths`. Record that each reports the same result on today's
      tree before and after (*Every check reads the tree through one
      tracked-file sweep*, *A second listing is introduced*)
- [ ] 2.5 Write the check the criterion names: a test failing when any tracked
      source file other than `bun/tracked.ts` and `bun/tracked.test.ts`
      derives a tree listing of its own. What it matches is enumeration, not
      the command — `git rev-parse --show-toplevel`, and `git ls-files` with no
      literal path operand, which `--error-unmatch` alone, a directory or a
      glob does not supply. `bun/settings.ts` asks git about named paths and
      must keep passing. 1.1 found three more sites it must settle, each
      switched or exempted with its reason in the check: `bun/check.ts`
      (`ls-files -s -z -- <dir>`, a directory operand that reads the mode the
      sweep does not return) and two tests that enumerate a fabricated
      repository, `bun/repo-layout.test.ts` and
      `bun/spec-coverage-sweep.test.ts`. Scope it by what it exempts, per
      `core/rules.md`, and
      break-check it both ways — reintroduce one listing and watch it fail,
      and confirm `bun/settings.ts` does not trip it (*A second listing is
      introduced*)
- [ ] 2.6 Delete the three "the shape `bun/no-suppressions.ts` uses"
      comments left behind at the switched sites: the comment existed because
      the code could not be shared, and it now points at a file that no longer
      owns the sweep (*A second listing is introduced*)
- [ ] 2.7 Measure every switched file against its cap and record the numbers
      (*change-slicing/No source file exceeds its per-file cap*)
