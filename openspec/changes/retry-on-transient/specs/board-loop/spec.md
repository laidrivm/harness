## ADDED Requirements

### Requirement: A transient failure ends the pass `retry`

A failure SHALL be transient when a request to GitHub's API or to Notion's
REST API got no answer, ran past its time limit, or was answered 5xx or 429;
when the key holder's mint failed for one of those reasons or was killed at
its time limit; or when a `git fetch` or `git push` failed, its stderr names
no HTTP status 4xx other than 429, and its stderr names a network failure: a
host that did not resolve, a network unreachable, no route to the host, a
connection refused, reset or timed out, an
`RPC failed`, `early EOF`, `unexpected disconnect` or `Empty reply from
server` error, or an HTTP status 5xx or 429; or when the Claude API ended a
pick or stage session: its result object reports an error ended by the API,
with no answer, 5xx or 429, and its text does not name the subscription's
usage limit (`You've hit your … limit`). Every other failure SHALL stay what
it is today, the usage limit included.

A pass SHALL record `retry`, print the step it reached and the failure, and
exit 75 when a transient failure ends it at any of: the default branch's
fetch; the App's identity or the integration's own id, read before the pick
session; the pick session; the stage session, when it left no tracked file
differing from `HEAD`, before the question's post and the push; the push
clone's fetch of `origin`, the token's mint or the push, after the stage
session; or the reads and the comment that post the session's question, short
of the question's `Assign` write and its answer, when the stage session left
no tracked file differing from `HEAD`, before the push. Where another requirement
has the pass refuse or record `open` at one of those points, a transient
failure SHALL end `retry` instead. The pass SHALL discard nothing a session left: a step branch
stays as the session left it, and the next pass continues it.

#### Scenario: GitHub's API does not answer before the pick

- **WHEN** the call for the App's identity cannot reach GitHub's API, or is
  answered 502
- **THEN** the pass launches no session, records `retry`, and exits 75

#### Scenario: GitHub refuses the App

- **WHEN** the call for the App's identity is answered 401
- **THEN** the pass refuses and exits 1, as before

#### Scenario: Notion is down

- **WHEN** the read of the integration's own id is answered 503 or times out
- **THEN** the pass launches no session, records `retry`, and exits 75

#### Scenario: The network drops during the default branch's fetch

- **WHEN** `git fetch` fails naming a host it could not resolve
- **THEN** the pass switches back to a noted step branch as a refusal does,
  records `retry`, and exits 75

#### Scenario: A dropped fetch that also names a refusal

- **WHEN** `git fetch` fails with stderr naming both `early EOF` and HTTP
  status 401
- **THEN** the pass never records `retry`

#### Scenario: The Claude API is overloaded during the pick

- **WHEN** the pick session ends on an API error answered 529
- **THEN** no stage session starts, the pass records `retry`, and exits 75

#### Scenario: The Claude API fails the stage after a commit

- **WHEN** the stage session commits to the step branch, then ends on an API
  error answered 500 or with no answer, leaving no tracked edit
- **THEN** nothing is pushed or posted, the step branch keeps its commits,
  the pass records `retry`, exits 75, and the next pass continues the branch

#### Scenario: The Claude API fails the stage mid-edit

- **WHEN** the stage session ends on such an API error with a tracked file
  differing from `HEAD`
- **THEN** the pass records `open`, naming the API error, and exits 1

#### Scenario: The subscription's usage limit is spent

- **WHEN** a session ends on a result that names the usage limit, answered
  429 or not
- **THEN** the pass never records `retry`

#### Scenario: The Claude API refuses the session's key

- **WHEN** a session ends on an API error answered 401
- **THEN** the pass ends as before, never `retry`

#### Scenario: The push meets a network failure

- **WHEN** the push of a ready step fails with stderr naming a connection
  reset, or the mint for its token is killed at its limit
- **THEN** no pull request is opened, the step branch keeps its commits, the
  pass records `retry` and exits 75

#### Scenario: A push origin rejects

- **WHEN** `origin` rejects the push because its branch moved
- **THEN** the pass records `open`, as before

#### Scenario: The question post meets Notion's 5xx

- **WHEN** a read before the question's post, or the post itself, is answered
  500
- **THEN** the printed question line says Notion did not answer, and the pass
  records `retry` and exits 75

#### Scenario: A question posted, Assign not written

- **WHEN** the question is posted and the `Assign` write is answered 503
- **THEN** the pass ends as *The runner posts a stage session's question from
  the integration* fixes, never `retry`
