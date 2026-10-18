# no-pr-attribution — design

## Context

The motivation is in proposal.md, *Why*. The requirements are in
`specs/agent-permissions/spec.md` and `specs/harness-updates/spec.md`. The
policy check (`bun/settings.ts`) compares the values it owns exactly, and the
sync (`bun/sync-settings.ts`) writes every one of them, importing the
constants the check compares.

## Decisions

### 1. The whole `attribution` object is the harness's

The check compares `attribution` with `{"pr": "", "sessionUrl": false}` as a
whole, and the sync replaces it whole. A consumer cannot add `commit`.
`core/git-and-prs.md` fixes the commit trailer for every consumer, and the
policy is "the same for every consumer", as `settings.ts` says. A `commit`
value would be the only way to change that trailer, so owning the object
whole keeps it at Claude Code's default.

- The comparison is `Bun.deepEquals`, so the same two keys in another order
  pass. A hand edit that reorders them is not a departure.
- **Rejected: checking only `attribution.pr`.** It would leave
  `sessionUrl` to each consumer, and `core/git-and-prs.md` forbids the
  session URL in the same sentence as the footer.

### 2. `sessionUrl: false` is included

The task asked for the pull request line. The session link is the same rule's
other half: the PR body "carries no attribution line at all — no session
URL", and a commit's only trailer is `Co-Authored-By`, where a cloud session
would add `Claude-Session`. It is flagged for the user in the pull request.

### 3. The object form, not `false`

`attribution: false` hides everything, the commit trailer included, and
Claude Code before v2.1.281 rejects it and skips the whole settings file — the
deny lists and hooks with it. The object form with string and Boolean values
has been read since v2.0.62.

### 4. The harness's own file is pinned by its own test

No consumer check reads this repository's `.claude/settings.json`, as
`settings-mcp.test.ts` already says for the MCP ask entries. A test reads it
and expects the same constant, as that one does.
