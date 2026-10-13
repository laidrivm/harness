#!/usr/bin/env bun
/**
 * The loop guard: one script on two events, sharing one count per session and
 * sub-agent. Registered without a matcher on both, so it sees every tool.
 *
 * On `PostToolUseFailure` it counts the failure under its fingerprint, and on
 * the third failure with one fingerprint it bars the call under the prompt
 * being processed. On `PreToolUse` it refuses a barred call made under that
 * same prompt, by exiting 2 with the reason on stderr; a new prompt lets the
 * call run once more. It never ends the session. The thresholds are fixed by
 * `openspec/changes/loop-guard/specs/loop-guard/spec.md`, not by configuration.
 *
 * It fails open, unlike the command guard: whatever it cannot read or write —
 * an event that is not JSON, an id unsafe as a file name, a count that is not
 * its own JSON, a store it cannot write — decides nothing. A missed count
 * costs one more failed call, where a refusal it cannot justify would stop a
 * call nothing was wrong with, and its registration carries no `|| exit 2`.
 *
 * The count holds hashes and numbers only, so nothing in it reads back as a
 * command or an error. Every call pays one bun start, at the cost the command
 * guard's header records.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Event = {
	hook_event_name?: unknown;
	session_id?: unknown;
	agent_id?: unknown;
	prompt_id?: unknown;
	tool_name?: unknown;
	tool_input?: unknown;
	error?: unknown;
	is_interrupt?: unknown;
};

/**
 * Failures by fingerprint, and each barred call key with the prompt it was
 * barred under (`null` when the event carried none) and its failure count.
 */
export type Count = {
	failures: Record<string, number>;
	barred: Record<string, { prompt: string | null; count: number }>;
};

/** The failure that warns and bars; the spec fixes it at three. */
const BAR_AT = 3;

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Every object's keys sorted, at any depth, so key order never splits a call. */
const sorted = (_: string, value: unknown) =>
	value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(
				Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
			)
		: value;

/**
 * The call key: the tool and its input, `description` dropped, since the
 * agent rewords it on every retry of one command.
 */
export function callKey(tool: string, input: unknown): string {
	const call =
		input && typeof input === "object" && !Array.isArray(input)
			? { ...input, description: undefined }
			: input;
	return sha(JSON.stringify([tool, call], sorted));
}

/**
 * The fingerprint: the call key and the error, with each run of digits read
 * as one `#` — durations, ids and timestamps differ on every run — and each
 * run of whitespace as one space.
 */
export function fingerprint(key: string, error: string): string {
	const text = error.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
	return sha(`${key}\n${text}`);
}

/** The count after one more failure; from the third on, the call is barred. */
export function fail(
	count: Count,
	key: string,
	print: string,
	prompt: string | null,
): Count {
	const n = (Number(count.failures[print]) || 0) + 1;
	const failures = { ...count.failures, [print]: n };
	if (n < BAR_AT) return { ...count, failures };
	return { failures, barred: { ...count.barred, [key]: { prompt, count: n } } };
}

/** The refusal of a call about to run, or nothing when it may run. */
export function refusal(
	count: Count,
	tool: string,
	key: string,
	prompt: string | null,
): string | undefined {
	const bar = count.barred[key];
	if (bar?.prompt !== prompt) return;
	return (
		`loop-guard: this ${tool} call has failed the same way ${bar.count} ` +
		"times, so it is refused until the next prompt. Do not retry it: " +
		"change approach, or end the turn with `BLOCKED` naming what only the " +
		"user can settle."
	);
}

const isRecord = (value: unknown): value is Record<string, never> =>
	!!value && typeof value === "object" && !Array.isArray(value);

/** The count in `file`; one missing or not the guard's own is empty. */
function load(file: string): Count {
	try {
		const { failures, barred } = JSON.parse(readFileSync(file, "utf8")) ?? {};
		if (isRecord(failures) && isRecord(barred)) return { failures, barred };
	} catch {
		// Unreadable: count from nothing, as the header says.
	}
	return { failures: {}, barred: {} };
}

/**
 * Where the count of the event's session, or of its sub-agent, lives — or
 * nothing for an id unsafe as a file name. The `.` between the two ids
 * cannot occur in either, so no pair of ids shares a file.
 */
function countFile(store: string, event: Event): string | undefined {
	const { session_id: session, agent_id: agent } = event;
	const safe = (id: unknown): id is string =>
		typeof id === "string" && /^[\w-]+$/.test(id);
	if (!safe(session) || (agent != null && !safe(agent))) return;
	return join(store, agent == null ? session : `${session}.${agent}`);
}

/**
 * Plays the event's role, choosing it from `hook_event_name`: the refusal on
 * `PreToolUse`, nothing on a counted failure or any other event.
 */
export function guard(event: Event, store: string): string | undefined {
	const file = countFile(store, event);
	const { tool_name: tool, error } = event;
	if (!file || typeof tool !== "string") return;
	const key = callKey(tool, event.tool_input);
	const prompt = typeof event.prompt_id === "string" ? event.prompt_id : null;
	if (event.hook_event_name === "PreToolUse")
		return refusal(load(file), tool, key, prompt);
	if (event.hook_event_name !== "PostToolUseFailure") return;
	if (event.is_interrupt === true || typeof error !== "string") return;
	const next = fail(load(file), key, fingerprint(key, error), prompt);
	mkdirSync(store, { recursive: true });
	// Written beside and renamed into place, so a reader never sees half a
	// count. Two failures recorded at once can still lose one increment,
	// which undercounts: the open side.
	const partial = `${file}.${process.pid}`;
	writeFileSync(partial, JSON.stringify(next));
	renameSync(partial, file);
}

if (import.meta.main) {
	// ponytail: one count file per session and sub-agent accumulates in the
	// OS temp dir, which the OS clears; prune here if that ever stops being
	// true.
	const store = join(tmpdir(), "loop-guard");
	let reason: string | undefined;
	try {
		reason = guard(JSON.parse(await Bun.stdin.text()) ?? {}, store);
	} catch {
		// Fail-open, as the header says.
	}
	if (reason) {
		process.stderr.write(`${reason}\n`);
		process.exit(2);
	}
}
