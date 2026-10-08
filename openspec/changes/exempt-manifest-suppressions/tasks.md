# exempt-manifest-suppressions — tasks

One group, so this change ships whole on `fix/exempt-manifest-suppressions`. It
closes two acceptance criteria of `commit-gates`: *The allowlist names the
markers it approves* and *A workspace manifest carries a marker*.

## 1. The root manifest leaves the scan

Closes `commit-gates/the-allowlist-names-the-markers-it-approves` and
`commit-gates/a-workspace-manifest-carries-a-marker`.

- [ ] 1.1 Add the failing case first, against `bun/no-suppressions.ts` as it
      stands, and record that it fails. Build a repository whose root
      `package.json` is **tracked** and holds `harness.suppressions` with the key
      `src/model.ts biome-ignore`, count one, and whose `src/model.ts` carries
      that one suppression. Call `scan(dir)` with no `approved` argument, so the
      allowlist is read from the manifest, and assert no findings. Today it
      reports `package.json:<line>: biome-ignore`. `fabricate` writes the manifest
      untracked, so this case needs the manifest in its tracked files instead.
      Cite `// spec: commit-gates/the-allowlist-names-the-markers-it-approves`
- [ ] 1.2 Add the case that pins the boundary: a tracked
      `packages/web/package.json` containing `@ts-ignore` is reported by path
      and line. It passes before and after 1.3, and is there so the fix cannot
      widen to every file named `package.json`. Cite
      `// spec: commit-gates/a-workspace-manifest-carries-a-marker`
- [ ] 1.3 Skip the root `package.json` in `scan()` beside `PROSE` and `self`,
      matching the path `git ls-files` reports at the root. Give the skip a
      comment naming why a marker there suppresses nothing (`read` in
      `bun/config.ts` parses it with `JSON.parse`) and that a workspace manifest
      stays scanned. Re-read the module's header comment, which lists the
      exemptions, and add this one. 1.1 now passes and 1.2 still does
- [ ] 1.4 Add a case run from a subdirectory with the 1.1 tree, asserting the
      root manifest is still skipped. The root-relative path is what the skip
      matches, and a scan started below the root must not change it
- [ ] 1.5 Run `bun test` and confirm the whole suite passes, the spec-coverage
      checks included, with the two new citations counted
