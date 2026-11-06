import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { boundary, cleanupTranscripts, reply, said, skill, transcript, typed } from "./context-window.fixture.ts";
import { REARM, THRESHOLD, wrapup } from "./context-window.ts";
import { decide } from "./turn-gate.ts";

/**
 * The context-window check in process: a transcript written into a directory
 * of the case's own, and the turn gate's mark path beside it, which is where
 * the check keeps `.wrapup`.
 */

afterAll(cleanupTranscripts);

/** A session: its transcript, appended to between stops, and its mark path. */
function session(...lines: object[]) {
	const { dir, path, add } = transcript(...lines);
	const file = join(dir, "s1");
	/** Appends `more`, then stops; `ask` is what the turn gate lets it do. */
	const stop = (more: object[] = [], ask = true) => {
		add(...more);
		return wrapup(file, { transcript_path: path }, ask);
	};
	return { dir, path, file, add, stop };
}

describe("the threshold", () => {
	// spec: context-window/a-context-past-the-threshold
	test("812 000 is refused, and the reason names the wrap-up, the clear, the subagents and the size", () => {
		const reason = session(reply(812_000)).stop();
		expect(
			["/session-wrapup", "«можно /clear»", "subagent", "812000"].filter((part) => !reason?.includes(part)),
		).toEqual([]);
	});

	// spec: context-window/a-context-at-the-threshold
	test("exactly the threshold is refused", () => {
		expect(session(reply(THRESHOLD)).stop()).toBeString();
	});

	// spec: context-window/a-context-below-the-threshold
	test("one token under it asks nothing", () => {
		expect(session(reply(THRESHOLD - 1)).stop()).toBeUndefined();
	});
});

describe("a wrap-up already asked for", () => {
	// spec: context-window/a-board-loop-stage-past-the-threshold
	test("an unattended session is not asked, and the mark keeps the line from being read again", () => {
		const s = session(said("Do the stage.\nThis session runs unattended.\n"), reply(820_000));
		expect(s.stop()).toBeUndefined();
		expect(existsSync(`${s.file}.wrapup`)).toBe(true);
		expect(s.stop([reply(830_000)])).toBeUndefined();
	});

	// spec: context-window/the-wrap-up-the-done-line-started
	test("a `Skill` call of the wrap-up counts as the ask, at this stop and the next", () => {
		const s = session(skill(), reply(815_000));
		expect(s.stop()).toBeUndefined();
		expect(s.stop([reply(830_000)])).toBeUndefined();
	});

	test("a scoped skill name counts too", () => {
		expect(session(skill("x:session-wrapup"), reply(815_000)).stop()).toBeUndefined();
	});

	// spec: context-window/a-wrap-up-the-user-typed
	test("the user's typed `/session-wrapup` counts", () => {
		expect(session(typed, reply(815_000)).stop()).toBeUndefined();
	});

	test("a typed directory-scoped name counts too", () => {
		const scoped = said("<command-name>/.claude/worktrees/x:session-wrapup</command-name>");
		expect(session(scoped, reply(815_000)).stop()).toBeUndefined();
	});

	test("a tool result quoting the tag does not count", () => {
		const read = {
			type: "user",
			isSidechain: false,
			message: {
				role: "user",
				content: [{ type: "tool_result", tool_use_id: "t", content: typed.message.content }],
			},
		};
		expect(session(read, reply(815_000)).stop()).toBeString();
	});

	test("a sidechain's call does not count", () => {
		expect(session({ ...skill(), isSidechain: true }, reply(815_000)).stop()).toBeString();
	});

	// spec: context-window/a-wrap-up-from-before-a-compaction
	test("a call before the last compaction boundary belongs to another context", () => {
		expect(session(skill(), reply(900_000), boundary(), reply(810_000)).stop()).toBeString();
	});
});

describe("the size read", () => {
	// spec: context-window/the-last-reply-counts
	test("the last reply's size, not the largest", () => {
		expect(session(reply(900_000), reply(120_000)).stop()).toBeUndefined();
	});

	// spec: context-window/a-sidechain-or-synthetic-reply-after-the-last-real-one
	test("a sidechain's reply and an all-zero one are passed over", () => {
		const reason = session(reply(810_000), reply(900_000, { isSidechain: true }), reply(0)).stop();
		expect(reason).toContain("810000");
	});

	// spec: context-window/a-compaction-and-no-reply-since
	test("a reply before the last compaction boundary is not read", () => {
		expect(session(reply(815_000), boundary()).stop()).toBeUndefined();
	});

	// spec: context-window/a-large-transcript
	test("a reply before the last 4 MiB is not read", () => {
		const padding = said("x".repeat(64 * 1024));
		const s = session(reply(810_000), ...Array.from({ length: 96 }, () => padding));
		expect(s.stop()).toBeUndefined();
	});

	// spec: context-window/a-transcript-smaller-than-the-tail
	test("a one-line transcript's reply is read", () => {
		expect(session(reply(810_000)).stop()).toBeString();
	});

	// spec: context-window/no-size-to-read
	test("no path, a missing file and a tail with no reply ask nothing", () => {
		const s = session(said("hi"), reply(0));
		expect([
			wrapup(s.file, {}, true),
			wrapup(s.file, { transcript_path: join(s.dir, "absent.jsonl") }, true),
			s.stop(),
		]).toEqual([undefined, undefined, undefined]);
	});
});

describe("once per context", () => {
	// spec: context-window/the-continued-turn
	test("the stop after a refusal ends", () => {
		const s = session(reply(830_000));
		expect(s.stop()).toBeString();
		expect(s.stop([reply(830_000)])).toBeUndefined();
	});

	// spec: context-window/a-compaction-re-arms-it
	test("a stop under half the threshold re-arms it", () => {
		const s = session(reply(805_000));
		expect([s.stop(), s.stop([reply(150_000)]), s.stop([reply(805_000)])].map(Boolean)).toEqual([true, false, true]);
	});

	// spec: context-window/a-small-shrink-does-not-re-arm-it
	test("a stop above half does not", () => {
		const s = session(reply(805_000));
		expect([s.stop(), s.stop([reply(790_000)]), s.stop([reply(802_000)])].map(Boolean)).toEqual([true, false, false]);
	});

	test("exactly half the threshold does not", () => {
		const s = session(reply(805_000));
		expect([s.stop(), s.stop([reply(REARM)]), s.stop([reply(805_000)])].map(Boolean)).toEqual([true, false, false]);
	});

	test("a mark it cannot write asks nothing", () => {
		const { path } = transcript(reply(850_000));
		expect(wrapup(join(path, "no-such-dir", "s1"), { transcript_path: path }, true)).toBeUndefined();
	});

	// spec: context-window/a-wrap-up-a-compaction-and-a-large-first-stop
	test("a compaction boundary the mark does not record re-arms it, whatever the size", () => {
		const s = session(skill(), reply(815_000));
		expect([s.stop(), s.stop([boundary(), reply(500_000)]), s.stop([reply(810_000)])].map(Boolean)).toEqual([
			false,
			false,
			true,
		]);
	});

	test("the boundary the mark records does not", () => {
		const s = session(boundary(), reply(805_000));
		expect([s.stop(), s.stop([reply(810_000)])].map(Boolean)).toEqual([true, false]);
	});

	// spec: context-window/the-turn-gate-refuses-the-first-stop-after-a-compaction
	test("a stop the caller does not let it refuse still re-arms it", () => {
		const s = session(reply(805_000));
		expect([s.stop(), s.stop([reply(150_000)], false), s.stop([reply(805_000)])].map(Boolean)).toEqual([
			true,
			false,
			true,
		]);
	});

	test("a stop it may not refuse asks nothing and writes no mark", () => {
		const s = session(reply(850_000));
		expect(s.stop([], false)).toBeUndefined();
		expect(existsSync(`${s.file}.wrapup`)).toBe(false);
	});

	// spec: context-window/a-resumed-session-above-the-threshold
	test("a resumed session under the same id is not asked again", () => {
		const s = session(reply(805_000));
		expect(s.stop()).toBeString();
		expect(wrapup(s.file, { transcript_path: s.path }, true)).toBeUndefined();
	});

	// spec: context-window/two-sessions
	test("another session's refusal does not hold this one's", () => {
		const s = session(reply(805_000));
		expect(s.stop()).toBeString();
		expect(wrapup(join(s.dir, "s2"), { transcript_path: s.path }, true)).toBeString();
	});

	// spec: context-window/an-unsafe-session-id
	test("no session id, or one unsafe as a file name, asks nothing and writes nothing", () => {
		const s = session(reply(850_000));
		const store = join(s.dir, "store");
		const asked = [undefined, "../x"].map((id) =>
			decide({ session_id: id, cwd: s.dir, transcript_path: s.path }, store),
		);
		expect({ asked, written: existsSync(store) ? readdirSync(store) : [] }).toEqual({
			asked: [undefined, undefined],
			written: [],
		});
	});
});
