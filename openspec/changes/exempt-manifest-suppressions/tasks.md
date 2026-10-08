# exempt-manifest-suppressions — tasks

One group, so this change ships whole on `fix/exempt-manifest-suppressions`. It
closes two acceptance criteria of `commit-gates`: *The allowlist names the
markers it approves* and *A workspace manifest carries a marker*.

## 1. The root manifest leaves the scan

Closes `commit-gates/the-allowlist-names-the-markers-it-approves` and
`commit-gates/a-workspace-manifest-carries-a-marker`.

- [x] 1.1 Add the failing case first, against `bun/no-suppressions.ts` as it
      stands, and record that it fails. Build a repository whose root
      `package.json` is **tracked** and holds `harness.suppressions` with the key
      `src/model.ts biome-ignore`, count one, and whose `src/model.ts` carries
      that one suppression. Call `scan(dir)` with no `approved` argument, so the
      allowlist is read from the manifest, and assert no findings. Today it
      reports `package.json:<line>: biome-ignore`. `fabricate` writes the manifest
      untracked, so this case needs the manifest in its tracked files instead.
      Cite `// spec: commit-gates/the-allowlist-names-the-markers-it-approves`.
      Add a second case in mellon's shape: three `biome-ignore` keys and two
      `@ts-expect-error` keys, with the suppressions they approve, and no
      `package.json` entry for either marker, asserting no findings
- [x] 1.2 Add the cases that pin the boundary. They pass before and after 1.3,
      and are there so the skip cannot widen past the one file: a tracked
      `packages/web/package.json` containing `@ts-ignore` is reported by path
      and line (cite
      `// spec: commit-gates/a-workspace-manifest-carries-a-marker`), a root
      `my-package.json` carrying a marker is reported, and a root
      `package.jsonc` carrying a comment marker is reported
- [x] 1.3 Skip the root `package.json` in `scan()` beside `PROSE` and `self`,
      matching the path `git ls-files` reports at the root. Give the skip a
      comment naming why a marker there suppresses nothing (`read` in
      `bun/config.ts` parses it with `JSON.parse`) and that a workspace manifest
      stays scanned. Re-read the module's header comment, which lists the
      exemptions, and add this one. 1.1 now passes and 1.2 still does
- [x] 1.4 Add a case run from a subdirectory with the 1.1 tree, asserting the
      root manifest is still skipped. The root-relative path is what the skip
      matches, and a scan started below the root must not change it
- [x] 1.5 Add a case where the allowlist still carries a
      `package.json biome-ignore` entry that now approves nothing, asserting no
      findings. Consumers depend on this between re-pinning and removing the
      entry
- [x] 1.6 Add a case where the tracked root manifest carries a
      `// biome-ignore` comment, asserting the command exits non-zero rather
      than passing. The skip is justified only by `read` refusing that file, so
      this pins the justification, not just the code
- [x] 1.7 Run `bun test` and confirm the whole suite passes, the spec-coverage
      checks included, with the two new citations counted
