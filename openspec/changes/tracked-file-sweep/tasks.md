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

- [ ] 1.1 Recount the copies before writing any of them. This change's own
      prose says seven, `PLAN.md` said three, and an earlier draft of this
      change said five; take the count by searching for `ls-files` alone over
      tracked `.ts`/`.tsx` — not for `show-toplevel`, which
      `checks/readme-map.test.ts` (in d2ass) never invokes and which is how
      that site went uncounted twice — and reconcile it against all three
      figures. Separate enumerations from the named-path query in
      `bun/settings.ts`, which is not a copy. An eighth that arrived since is
      the case this task exists for (*all three*)
- [ ] 1.2 Write the sweep in `bun/tracked.ts` as `tracked(cwd?)` returning
      `{ root, paths, files }` — the root, every tracked path relative to it,
      and the subset of those that are regular files —
      with the three reasons carried as comments: the listing taken at the root
      and not `cwd`, only git's terminator stripped and not `trim()`, and why a
      caller that opens what it reads takes the filtered view (*all three*)
- [ ] 1.3 Test it in `bun/tracked.test.ts`, one case per criterion, each
      with its `// spec:` citation: run from a subdirectory it still lists the
      whole repository with root-relative paths (*A check run from a
      subdirectory*); a tracked path deleted from the work tree is absent from
      the filtered view and present in the unfiltered one (*A tracked file
      absent from the work tree*); a repository whose path ends in a space
      keeps the space (*A repository path ending in a space*). Fabricate the
      repository — the last case cannot be observed in this one
- [ ] 1.4 Switch `bun/no-suppressions.ts`. Run the gate before and after
      and record that it reports the same findings on today's tree. Its comment
      says "an ignored or untracked file cannot fail a clone that does not have
      it", which conflates the two — an ignored file that is tracked is in
      every clone; correct it to name untracked files while the line is open
      (*A second listing is introduced*)
- [ ] 1.5 Measure `bun/tracked.ts`, `bun/tracked.test.ts` and
      `bun/no-suppressions.ts` against the 300-line cap and record the numbers
      (*change-slicing/No source file exceeds its per-file cap*)

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
- [ ] 2.4 Switch the two path-only callers to `paths`:
      `checks/readme-map.test.ts` (in d2ass, on the `D2ASS` card with 2.3),
      which takes no root today and so escaped both earlier counts, and
      `bun/file-size.test.ts`'s inline copy at line ~179. Neither applies
      an `lstatSync` filter, on purpose — a tracked path deleted from the work
      tree still carries an extension to rule on and a map row to satisfy — so
      confirm the extension set and the row resolutions they assert are
      unchanged, which is what proves the list is the right one — the unfiltered view is the
      requirement's, not this caller's preference (*Every check reads the tree
      through one tracked-file sweep*, *A second listing is introduced*)
- [ ] 2.5 Write the check the criterion names: a test failing when any tracked
      source file other than `bun/tracked.ts` and `bun/tracked.test.ts`
      derives a tree listing of its own. What it matches is enumeration, not
      the command — `git rev-parse --show-toplevel`, and `git ls-files` with no
      literal path operand, which `--error-unmatch` alone, a directory or a
      glob does not supply. `bun/settings.ts` asks git about named paths and
      must keep passing. Scope it by what it exempts, per `core/rules.md`, and
      break-check it both ways — reintroduce one listing and watch it fail,
      and confirm `bun/settings.ts` does not trip it (*A second listing is
      introduced*)
- [ ] 2.6 Delete the three "the shape `bun/no-suppressions.ts` uses"
      comments left behind at the switched sites: the comment existed because
      the code could not be shared, and it now points at a file that no longer
      owns the sweep (*A second listing is introduced*)
- [ ] 2.7 Measure every switched file against its cap and record the numbers
      (*change-slicing/No source file exceeds its per-file cap*)
