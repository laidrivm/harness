# gh-api-guard

## Why

The prohibition on publishing text under the user's name is enforced by
matching subcommand names — `gh pr comment`, `gh issue comment`, `gh pr
review` — in `permissions.deny` and again in `scripts/command-guard.ts`'s
`GH_WRITES`. `gh api` reaches the same endpoints under a spelling neither
matches, so the boundary is currently held by the agent obeying prose.

Probed against the guard on `82948be`, with the three named writes as the
control:

| command | guard |
| --- | --- |
| `gh pr comment 1 --body hi` | exit 2, blocked |
| `gh issue comment 1 --body hi` | exit 2, blocked |
| `gh pr review 1 --approve` | exit 2, blocked |
| `gh api -X POST /repos/o/r/issues/1/comments -f body=hi` | exit 0, allowed |
| `gh api --method POST /repos/o/r/pulls/1/reviews -f event=APPROVE` | exit 0, allowed |
| `gh api graphql -f query=mutation{addComment…}` | exit 0, allowed |
| `gh api -X PATCH /repos/o/r/issues/comments/1 -f body=edited` | exit 0, allowed |

`bash -c "gh api -X POST …"` passes too, where the wrapped form of the named
write is blocked — so the gap is in what the guard looks for, not in how far
it reaches.

`gh api` is in no tracked permission list, so today it prompts like any
unlisted command and the user sees it. That is a prompt, not a boundary:
`docs/git-and-prs.md` states the rule as absolute — *never* reply, comment or
review under the user's name — and a rule whose only enforcement is a prompt
the user may approve while reading something else is not the rule as written.

## What Changes

- `scripts/command-guard.ts` blocks a `gh api` invocation that cannot be shown
  to be a read, beside the subcommand pairs it already blocks. `gh api --help`
  states the method: `GET` by default, and `POST` as soon as any parameter is
  added — so a read is a call whose `--method`/`-X` names `GET` or `HEAD`,
  whatever fields it carries, or one naming no method and carrying no
  parameter flag: `-f`, `-F`, `--field`, `--raw-field` or `--input`. Anything
  else is a write.
- The refusal names `gh api` and what made the call a write, so an author who
  meant to read sees which flag to drop.
- `openspec/specs/agent-permissions` §*GitHub write commands are denied* gains
  what the deny entries cannot express and the guard must therefore hold.
- `docs/git-and-prs.md`'s prohibition narrows to what the mechanism still does
  not cover — a tracker, a forum, any service that is not GitHub — per
  `openspec/specs/agent-rulebook` §*A mechanised prohibition leaves its prose
  home*.

## Non-goals

- **Blocking `gh api` reads.** The `coderabbit` skill's first step is three of
  them — the inline comments, the issue comments and the reviews of a pull
  request — and they are how a review is read at all. A change that stopped
  them would trade one gate for another.
- **A deny entry for `gh api`.** A permission pattern matches a prefix, so it
  can express `gh api` whole or nothing narrower: `Bash(gh api -X POST *)`
  misses `--method POST`, misses `-f` with no method at all, and misses the
  flag written after the path. The deny list stays the three subcommands and
  the guard stays the boundary, which is the division the modified requirement
  already describes.
- **Distinguishing a GraphQL query from a mutation.** Reading the operation
  out of a `-f query=…` string is parsing an argument to decide whether to
  block, where the guard's rule elsewhere is to resolve uncertainty towards
  blocking. Nothing in this project's documented workflow calls
  `gh api graphql`, so refusing it whole costs nothing to name here.
- **Every other route to the same act.** `curl` against the GitHub API, a
  personal token in a script, the web UI. This change closes the route the
  repository's own tooling makes easy, and the prose keeps the rest.

## Capabilities

### New Capabilities

None. The boundary this widens is `agent-permissions`, and a capability of its
own would put a second specification over one guard.

### Modified Capabilities

- `agent-permissions`: the requirement that GitHub write commands are denied
  names three subcommands and the guard that catches their wrapped spellings.
  It gains the endpoint route — a `gh api` call that cannot be shown to be a
  read is blocked, and a read is not — because a prohibition matched by
  subcommand name does not reach a command that names no subcommand.

## Impact

- `scripts/command-guard.ts` — one check beside `GH_WRITES`, reading the flags
  `gh api` takes rather than the path it addresses.
- `scripts/command-guard.test.ts` — the writes blocked, the reads passed, and
  the wrapped and compound forms the existing cases already cover.
- `openspec/specs/agent-permissions/spec.md` — one requirement modified.
- `docs/git-and-prs.md` — the prohibition loses the GitHub clause it no longer
  has to carry.
- `.claude/settings.json` — unchanged; see Non-goals.
- No dependency, workflow or runtime change, and nothing the application ships
  is touched.
