# gh-api-guard — design

## Context

`scripts/command-guard.ts` blocks three acts: a commit while `HEAD` is on
`main`, a force-push wherever the flag sits, and the `gh` commands that publish
text under the user's name. The third is a list of subcommand pairs:

```ts
const GH_WRITES = [["pr", "comment"], ["issue", "comment"], ["pr", "review"]];
```

and the check reads the non-flag words of a `gh` invocation looking for an
adjacent pair. `gh api` names no subcommand — its operand is a path — so no
pair matches and the call falls through to `continue`.

The same acts are reachable that way. Probed on `82948be`, with the three
named writes as controls blocking at exit 2, four `gh api` spellings of the
same acts all returned exit 0: `-X POST` to an issue's comments, `--method
POST` to a pull request's reviews, `graphql` carrying a mutation, and `-X
PATCH` to an existing comment. `bash -c "gh api -X POST …"` returned 0 too,
where the wrapped named write blocks — the guard's reach into wrappers is
fine, its list of what to look for is not.

The constraint that shapes the rest: `gh api` is also how a pull request's
review is read at all. The `coderabbit` skill's first step is three
`gh api` reads, and `gh pr view` cannot replace them.

## Goals / Non-Goals

**Goals:**

- A `gh api` call that cannot be shown to be a read is blocked, wherever the
  guard already reaches — a wrapper, a compound command, an absolute path.
- Every read the documented workflow makes passes unchanged.
- The refusal names what made the call a write, so an author who meant to read
  sees which flag to drop.

**Non-Goals:**

- A deny entry. It matches a prefix and would take the reads with it.
- Deciding by endpoint path. `…/issues/N/comments` is a read under `GET` and a
  write under `POST`; the method is the thing that differs, and a list of
  write paths is an enumeration of what the scan covers, which `CLAUDE.md`
  forbids in favour of naming what it exempts.
- Parsing a GraphQL document to tell a query from a mutation.

## Decisions

### The method decides, and `gh api --help` is what says so

Asked of the tool rather than assumed: *"The default HTTP request method is
`GET` normally and `POST` if any parameters were added. Override the method
with `--method`"*, and *"adding request parameters will automatically switch
the request method to `POST`. To send the parameters as a `GET` query string
instead, use `--method GET`"*.

So the read test is two clauses, in this order:

1. `--method` or `-X` naming `GET` or `HEAD`, case-insensitively → a read,
   whatever parameters follow.
2. No method flag and no parameter flag — `-f`, `-F`, `--field`,
   `--raw-field`, `--input` → a read, by the default.

Anything else is a write. Checking the explicit method first is what keeps
`gh api -X GET /search/issues -f q=…` passing: a rule that refused any
parameter flag would block a read the tool documents.

*Alternative considered.* Refusing every parameter flag regardless of method,
for a smaller check. Rejected — it blocks a documented read, and a guard that
refuses correct work is one people route around.

### `graphql` is refused whole

An operand of `graphql` is blocked whichever operation the document carries.
Telling a query from a mutation means reading inside a `-f query=…` value,
which is parsing an argument to decide whether to block; the guard's existing
rule for `git push` options resolves the same uncertainty towards blocking.
Nothing in this project calls `gh api graphql` — grepped, with `gh api` as the
control term that the same query finds — so the cost of refusing it is
currently zero and the refusal says what to do instead.

### The check sits inside the existing `gh` branch

The `name === "gh"` branch already has the invocation split into its words and
already runs for every spelling the parser resolves to `gh`. Adding the test
there inherits the wrapper and compound reach the existing cases prove, rather
than earning its own. `GH_WRITES` keeps its shape: the pair list and the `api`
test answer different questions about the same invocation.

## Risks / Trade-offs

- **A read the workflow needs is blocked, and the block looks like a bug.** →
  The two read clauses come from `gh api --help` rather than from a guess, and
  the `coderabbit` skill's three calls are the named regression case. The
  refusal names the flag that decided it.
- **A write spelling neither clause catches.** → `--input` is in the list
  because it sends a body; a future flag that does the same would not be. The
  test is nonetheless scoped by what it exempts — a read is the narrow, named
  case and everything else blocks — so an unknown flag fails closed.
- **The prose in `docs/git-and-prs.md` is narrowed while the mechanism covers
  only GitHub.** → What it loses is the GitHub clause alone; a tracker, a
  forum and any other service stay in the sentence, which is the *partly
  covered* case `openspec/specs/agent-rulebook` describes.
- **`gh api` still prompts, so nothing was reachable without the user
  anyway.** → A prompt is what the user sees, not what the boundary is, and
  the same argument would retire the three deny entries. This change is worth
  its size because the rule is stated as absolute and its enforcement was not.
