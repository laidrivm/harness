# agent-permissions — delta spec

## ADDED Requirements

### Requirement: A question to the user on a board card needs no prompt

A `PermissionRequest` hook the harness registers SHALL answer `allow` to the
prompt for `notion-create-comment` only when the call is a question as the
scenarios below fix it, and SHALL give no answer to any other call, so the
prompt stands where a session can show one and the call is refused where it
cannot. The hook SHALL NOT itself refuse a call, and each answer it gives
SHALL be recorded in the gate ledger.

#### Scenario: A question on a card

- **WHEN** the session calls `notion-create-comment` with a `page_id` and
  `markdown` only, on a page the session has read through the connector whose
  parent data source is one of the boards *There are three boards and a card
  goes to one of them* names, the text opening with the inline-code mark
  `harness-question`, mentioning no user, at most 1500 characters long, and
  the hook has allowed fewer calls in this session than task-board's *At most
  two questions wait at once* lets wait
- **THEN** the hook answers `allow`, the comment is posted without a prompt,
  and the ledger records the call as allowed

#### Scenario: The same question where no prompt can be shown

- **WHEN** a session started with `-p` makes that call
- **THEN** the comment is posted, because the hook answers the prompt such a
  session cannot show

#### Scenario: A reply in an existing thread

- **WHEN** the call carries `discussion_id` or `reply_to_comment_id`
- **THEN** the hook gives no answer, because a thread may hold another
  person's words and a reply there speaks to them

#### Scenario: A comment anchored on a passage

- **WHEN** the call carries `selection_with_ellipsis`
- **THEN** the hook gives no answer

#### Scenario: Text the hook cannot read as one string

- **WHEN** the call carries `rich_text` instead of `markdown`
- **THEN** the hook gives no answer

#### Scenario: A comment without the mark, or with it elsewhere

- **WHEN** the text does not open with the mark, including text that carries
  it after its first characters
- **THEN** the hook gives no answer, because only the opening mark tells a
  reader the comment is the agent's and not the user's

#### Scenario: A comment mentioning a user

- **WHEN** the text holds a user mention, the user's own included
- **THEN** the hook gives no answer, because a mention notifies its subject
  of text that reads as the user's

#### Scenario: A comment over the length bound

- **WHEN** the text is 1501 characters long
- **THEN** the hook gives no answer; at 1500 it may answer `allow`

#### Scenario: A page that is not a card

- **WHEN** the page's parent data source has another name, or the session's
  record shows no read of that page
- **THEN** the hook gives no answer

#### Scenario: The ceiling reached

- **WHEN** the hook has already allowed as many calls in this session as
  task-board's *At most two questions wait at once* lets wait
- **THEN** it gives no answer to the next, and the ledger records that call
  as passed to the prompt

#### Scenario: The hook cannot read what it decides on

- **WHEN** the event is not JSON, or the session's record or the ledger
  cannot be read
- **THEN** the hook gives no answer, so a fault leaves the prompt standing
  rather than allowing the call

#### Scenario: A mode that never prompts

- **WHEN** the session runs in `dontAsk` mode
- **THEN** the call is refused even when it is a question, because that mode
  refuses a call before any prompt is raised for the hook to answer

#### Scenario: A project denies the tool

- **WHEN** a project's settings deny `notion-create-comment`
- **THEN** the call is refused and the hook is never consulted, because deny
  is evaluated before the prompt exists

#### Scenario: The hook in a consumer

- **WHEN** a consumer's `.claude/settings.json` lacks the hook, or carries it
  with another matcher or command
- **THEN** the consumer's check fails naming it, as it does for every hook
  the harness registers
