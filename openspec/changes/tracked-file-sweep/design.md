# tracked-file-sweep — design

## Context

Five sites derive the same listing, and a sixth sits inline in a test. Three
carry the same explanatory comment pointing at `scripts/no-suppressions.ts` as
the shape they copy, which is the tell: the comment exists because the code
could not be shared.

What every caller needs is identical — the repository root and the tracked
paths under it. What differs is what each does next: five open the files and so
want the regular ones among those paths, two rule on the paths themselves and
must not lose a deleted-but-tracked one, and each then applies a filter of its
own — extensions (`.css`, the test-file spelling set), prose exemptions, a
check excluding its own two paths.

Two copies have already drifted on the root, using `trim()` where the others
deliberately strip only git's terminator. Nothing failed, because no repository
in play has a path ending in a space — which is what makes it drift rather than
a bug report.

## Goals / Non-Goals

**Goals:**

- One listing, filtered at the call site.
- The subdirectory case and the tracked-but-absent case written once.
- The `trim()` divergence gone, not merely documented.

**Non-Goals:**

- Sharing the filters. A caller's filter is its own subject.
- One `git` spawn for the whole suite.
- Any change to what a check reports on today's tree — the task list checks
  that, per site.

## Decisions

### The module lives under `scripts/`, and `src/**` imports it

Two of the callers are tests under `src/app/`, and `CLAUDE.md` forbids
`src/model.ts` and `src/types.ts` from importing `src/app/**` — it says nothing
about a test under `src/app/` importing a script, and `src/app/module-classes.test.ts`
already imports `../../scripts/scan.ts`. So the direction is established and
the module goes beside its siblings in `scripts/`.

*Alternative considered.* A `src/shared/` home was rejected: the sweep is not
application code, it ships in no bundle, and putting it under `src/` would make
it the only thing there that the app never runs.

### One export, three named results

`tracked(cwd?)` returns `{ root, paths, files }`:

- `root` — the repository root, `git rev-parse --show-toplevel` with only its
  terminating newline removed. Five callers need it again to build an absolute
  path for `readFileSync`, and re-deriving it means a second spawn and a second
  chance to disagree about that newline.
- `paths` — every tracked path, relative to `root`, in git's order, with the
  empty field `-z` leaves at the end dropped. A path deleted from the work
  tree, a symlink and a submodule gitlink are all present here.
- `files` — the subset of `paths` that `lstatSync` reports as regular files, so
  each of those three is absent. This is what a caller that opens what it lists
  takes.

Both lists, not one plus a flag: a boolean at a call site says nothing about
which view it selects.

### Paths stay relative to the root

Every caller reports paths relative to the root — that is what appears in a
failure message and in `SELF` exclusion lists — so the sweep returns them that
way and hands out the root for joining. Returning absolute paths would push a
`relative()` call into each caller and change every message.

### `trim()` becomes `replace(/\n$/, "")` everywhere, not the other way

The three script copies chose it on purpose and wrote the reason down. A
trailing space in a repository path is unusual; corrupting it silently is worse
than carrying it.

### Two views over one listing, so no caller needs an exemption

`scripts/file-size.test.ts`'s inline copy is the one that looked like it needed
one. It enumerates the extensions tracked paths carry and applies no
`lstatSync` filter, deliberately: a tracked path deleted from the work tree
still carries an extension somebody has to rule on, and the filtered view would
drop it. So the sweep offers both — git's paths, and the regular files among
them — and that caller takes the first.

An exemption was the alternative and is rejected: `spec.md` requires one
listing without qualification, and a change whose specification and task list
disagree about whether a sixth copy may stand is how the count reached five.

*Alternative considered.* An exemption in the specification for the two
path-only callers was rejected above; a flag rather than two named results is
rejected under *One export, three named results*.

## Risks / Trade-offs

- **A shared sweep means one bug reaches every gate at once.** → That is the
  trade being taken deliberately: five copies mean five bugs nobody notices,
  and the two cases that exist today only cover two of them. The mitigation is
  that the sweep gets the tests, not the callers.
- **A caller's filter changes meaning once the listing is shared** — for
  instance a filter that assumed absolute paths. → Each switch is checked by
  running that gate before and after and comparing what it reports on today's
  tree, per site, recorded in the task list.
- **The `trim()` fix changes behaviour in a case nothing exercises.** → It is
  asserted directly, on a fabricated repository whose path ends in a space,
  rather than left to the tree nobody has one in.
- **The lift lands while `scan-lift` also touches `scripts/spec-coverage.ts`
  and `src/app/module-classes.test.ts`.** → Different regions of both files —
  `scan-lift` touches the comment scanner, this one the listing — so the
  conflict is textual at worst. Whichever lands second rebases.
