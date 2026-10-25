/**
 * The runner's Notion integration, before any call: the settings file it reads
 * and the `QUESTION:` line it reads from a stage session's final message. The
 * five REST calls are in `notion-bot-rest.test.ts`. [n]: the proposal-stage
 * `/zombies` list of #184.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { named } from "./board-loop-push.ts";
import { asked, settings } from "./notion-bot.ts";
import { MARK, REMEDY, where } from "./question-gate.ts";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const TOKEN = "ntn_secret0value";
const USER = "0123456789abcdef0123456789abcdef";
const UUID = "01234567-89ab-cdef-0123-456789abcdef";
const CARD = "aaaabbbbccccddddeeeeffff00001111";
const QUESTION = `${MARK} Ship the hook as one group? 1 — yes, 2 — no.`;

/** A settings file holding `content` at `mode`, and its path. */
function file(content: unknown, mode = 0o600): string {
	const dir = mkdtempSync(join(tmpdir(), "notion-bot-"));
	dirs.push(dir);
	const path = join(dir, "notion-bot.json");
	writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
	chmodSync(path, mode);
	return path;
}

/** The refusal `settings` throws for `path`, which holds every part and never the token [7]. */
function refused(path: string, ...parts: string[]): void {
	let message = "";
	try {
		settings(path);
	} catch (error) {
		message = (error as Error).message;
	}
	for (const part of [path, ...parts]) expect(message).toContain(part);
	expect(message).not.toContain(TOKEN);
}

describe("the settings file", () => {
	// spec: board-loop/no-settings-file
	test("no file reads as no integration [1]", () => {
		expect(settings(join(tmpdir(), "no-such-dir", "notion-bot.json"))).toBeUndefined();
	});

	// spec: board-loop/a-usable-settings-file
	test.each([0o600, 0o400])("mode %o is accepted, and both values read [2]", (mode) => {
		expect(settings(file({ token: TOKEN, user: USER }, mode))).toEqual({ token: TOKEN, user: USER });
	});

	// spec: board-loop/a-settings-file-others-may-read
	test.each([
		[0o640, "0640"],
		[0o604, "0604"],
	])("mode %o is refused, naming the file and the mode [2]", (mode, shown) => {
		refused(file({ token: TOKEN, user: USER }, mode), shown);
	});

	// spec: board-loop/a-settings-file-the-runner-cannot-use
	test.each(["", "   ", "ntn two words", 42])("the token %p is refused [3]", (token) => {
		refused(file({ token, user: USER }), "`token`");
	});

	test.each([USER, UUID, USER.toUpperCase()])("the user id %p is accepted [4]", (user) => {
		expect(settings(file({ token: TOKEN, user }))?.user).toBe(user);
	});

	test.each([USER.slice(1), `${USER}x`, `${UUID}-`, "user"])("the user id %p is refused [4]", (user) => {
		refused(file({ token: TOKEN, user }), "`user`");
	});

	test.each([USER, UUID])("the board id %p is read", (board) => {
		expect(settings(file({ token: TOKEN, user: USER, board }))).toEqual({ token: TOKEN, user: USER, board });
	});

	test.each([`${USER}x`, "Harness", 42, null])("the board id %p is refused, naming the key and never the value", (board) => {
		const path = file({ token: TOKEN, user: USER, board });
		refused(path, "`board`");
		expect(() => settings(path)).toThrow(`notion-bot: ${path}: \`board\` is not 32 hex digits, alone or as a UUID`);
	});

	test("the file is found under XDG_CONFIG_HOME, then under ~/.config [5]", () => {
		expect(where("notion-bot.json", { XDG_CONFIG_HOME: "/x", HOME: "/h" })).toBe("/x/harness/notion-bot.json");
		expect(where("notion-bot.json", { HOME: "/h" })).toBe("/h/.config/harness/notion-bot.json");
		expect(where("notion-bot.json", { XDG_CONFIG_HOME: "", HOME: "/h" })).toBe("/h/.config/harness/notion-bot.json");
	});

	test.each([
		["not JSON", `{"token": "${TOKEN}"`],
		["a JSON array", `["${TOKEN}"]`],
		["JSON null", "null"],
	])("%s is refused, naming the file [6]", (_, content) => {
		refused(file(content));
	});

	test("a directory at the path is refused, naming it [6]", () => {
		const dir = mkdtempSync(join(tmpdir(), "notion-bot-"));
		dirs.push(dir);
		mkdirSync(join(dir, "notion-bot.json"));
		refused(join(dir, "notion-bot.json"));
	});
});

describe("the QUESTION: line", () => {
	// spec: board-loop/no-question
	test("no line is no question [9]", () => {
		expect(asked("Done.\nPR-TITLE: t\nPR-BODY:\nb")).toBeUndefined();
	});

	// spec: board-loop/a-question-posted
	test("one line and the text below it are read [10]", () => {
		expect(asked(`BLOCKED — a choice.\nQUESTION: ${CARD}\n${QUESTION}\n`)).toEqual({ card: CARD, text: QUESTION });
	});

	// spec: board-loop/a-malformed-question-line
	test.each([
		["two lines [11]", `QUESTION: ${CARD}\n${QUESTION}\nQUESTION: ${CARD}\n${QUESTION}`, "more than one"],
		["one after PR-BODY: [12]", `PR-TITLE: t\nPR-BODY:\nb\nQUESTION: ${CARD}\n${QUESTION}`, "after PR-BODY:"],
		["one between PR-TITLE: and PR-BODY: [12]", `PR-TITLE: t\nQUESTION: ${CARD}\n${QUESTION}\nPR-BODY:\nb`, "after PR-TITLE:"],
		["an id with text after it [15]", `QUESTION: ${CARD} please\n${QUESTION}`, "card id"],
		["a short id", `QUESTION: ${CARD.slice(1)}\n${QUESTION}`, "card id"],
	])("%s posts nothing and says why", (_, said, why) => {
		expect(asked(said)).toContain(why);
	});

	// spec: board-loop/where-the-question-ends
	test("the text ends before PR-TITLE:, and the title and body still read [13]", () => {
		const said = `QUESTION: ${CARD}\n${QUESTION}\nPR-TITLE: Ship it\nPR-BODY:\nThe body.`;
		expect(asked(said)).toEqual({ card: CARD, text: QUESTION });
		expect(named(said)).toEqual({ title: "Ship it", body: "The body." });
	});

	test("a UUID id and a CRLF message read trimmed [16]", () => {
		expect(asked(`QUESTION: ${UUID}\r\n${QUESTION}\r\n`)).toEqual({ card: UUID, text: QUESTION });
	});

	// spec: board-loop/text-the-question-gate-would-not-allow
	test.each([
		["at most 1500 characters is posted [14]", `${MARK} ${"q".repeat(1500 - MARK.length - 1)}`, undefined],
		["1501 characters is not [14]", `${MARK} ${"q".repeat(1500 - MARK.length)}`, "length"],
		["1500 counted by code point, as the gate counts [14]", `${MARK} ${"😀".repeat(1500 - MARK.length - 1)}`, undefined],
		["empty text [17]", "", "unmarked"],
		["a mention [18]", `${QUESTION} <mention-user url="user://u"/>`, "mention"],
		["the mark after the first characters [19]", `Hi ${QUESTION}`, "unmarked"],
	])("%s", (_, text, rule) => {
		const read = asked(`QUESTION: ${CARD}\n${text}`);
		if (rule === undefined) expect(read).toEqual({ card: CARD, text });
		else expect(read).toBe(`the question fails the question gate (${rule}): ${REMEDY[rule]}`);
	});
});
