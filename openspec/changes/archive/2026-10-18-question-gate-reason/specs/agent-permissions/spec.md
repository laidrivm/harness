# agent-permissions delta

## MODIFIED Requirements

### Requirement: A question to the user on a board card needs no prompt

A `PermissionRequest` hook the harness registers SHALL answer `allow` to the
prompt for `notion-create-comment` only when the call is a question as the
scenarios below fix it. It SHALL give no answer to any other call, so the
prompt stands where a session can show one. In a session whose starting
prompt declares it unattended, as agent-autonomy's *A session is attended
unless the prompt that started it says otherwise* fixes, the hook SHALL
instead answer `deny` to such a call, with a message that names the first
condition the call failed and what would meet it, because no answer there is
a refusal that the session is told not to retry. The hook SHALL NOT refuse a
call in any other session, and each call it sees SHALL be recorded in the
gate ledger. A scenario below in which the hook does not answer `allow`
therefore ends in no answer, or, in an unattended session, in that `deny`.
This is the one exception to *Sending as the user through an MCP tool
prompts*.

#### Scenario: A question on a card

- **WHEN** the session calls `notion-create-comment` with a `page_id` and
  `markdown` only, on a page the session has read through the connector whose
  parent data source is one of the boards *There are three boards and a card
  goes to one of them* names, the text opening with the inline-code mark
  `harness-question`, mentioning no user, at most 1500 characters long, and
  the session's record shows it read that page's comments
- **THEN** the hook answers `allow`, the comment is posted without a prompt,
  and the ledger records the call as allowed

#### Scenario: The same question where no prompt can be shown

- **WHEN** a session started with `-p` makes that call
- **THEN** the comment is posted, because the hook answers the prompt such a
  session cannot show

#### Scenario: A reply in an existing thread

- **WHEN** the call carries `discussion_id` or `reply_to_comment_id`
- **THEN** the hook does not answer `allow`, because a thread may hold
  another person's words and a reply there speaks to them

#### Scenario: A comment anchored on a passage

- **WHEN** the call carries `selection_with_ellipsis`
- **THEN** the hook does not answer `allow`

#### Scenario: Text the hook cannot read as one string

- **WHEN** the call carries `rich_text` instead of `markdown`
- **THEN** the hook does not answer `allow`

#### Scenario: A comment without the mark, or with it elsewhere

- **WHEN** the text does not open with the mark, including text that carries
  it after its first characters
- **THEN** the hook does not answer `allow`, because only the opening mark
  tells a reader the comment is the agent's and not the user's

#### Scenario: A comment mentioning a user

- **WHEN** the text holds a user mention, the user's own included
- **THEN** the hook does not answer `allow`, because a mention notifies its
  subject of text that reads as the user's

#### Scenario: A comment over the length bound

- **WHEN** the text is 1501 characters long
- **THEN** the hook does not answer `allow`; at 1500 it may

#### Scenario: A page that is not a card

- **WHEN** the page's parent data source has another name, or the session's
  record shows no read of that page
- **THEN** the hook does not answer `allow`

#### Scenario: A card whose comments were not read

- **WHEN** the session's record holds no read of that page's comments
- **THEN** the hook does not answer `allow`, and in an attended session the
  ledger records the call as passed to the prompt

#### Scenario: A call the hook does not allow, in an unattended session

- **WHEN** a session whose first prompt holds the line
  `This session runs unattended.`, on a line of its own, makes a call that
  fails any condition of *A question on a card*
- **THEN** the hook answers `deny` with a message that names the first
  condition the call failed and what would meet it, and the ledger records
  the call as refused under that condition

#### Scenario: The comment corrected after a refusal

- **WHEN** that session sends the call again, now meeting every condition
- **THEN** the hook answers `allow`, as it would have the first time

#### Scenario: A person at the prompt

- **WHEN** a session whose first prompt lacks that line makes a call that
  fails a condition
- **THEN** the hook gives no answer, so the user may still approve the
  comment at the prompt, and the ledger records the call as passed

#### Scenario: The line outside the first prompt

- **WHEN** the line appears only in a prompt after the first, or only inside
  a longer line of the first
- **THEN** the hook reads the session as attended and gives no answer to a
  call it does not allow

#### Scenario: Many questions in one session

- **WHEN** a session posts its tenth conforming question
- **THEN** the hook answers `allow` as it did for the first, because no count
  of questions bounds it

#### Scenario: The hook cannot read what it decides on

- **WHEN** the event is not JSON, or the session's record cannot be read
- **THEN** the hook gives no answer, in an unattended session as in any
  other, so a fault leaves the prompt standing rather than allowing the call

#### Scenario: A project denies the tool

- **WHEN** a project's settings deny `notion-create-comment`
- **THEN** the call is refused and the hook is never consulted, because deny
  is evaluated before the prompt exists

#### Scenario: The hook in a consumer

- **WHEN** a consumer's `.claude/settings.json` lacks the hook, or carries it
  with another matcher or command
- **THEN** the consumer's check fails naming it, as it does for every hook
  the harness registers
