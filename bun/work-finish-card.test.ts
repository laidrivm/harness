/**
 * `finish --card`'s record on the card (`work-finish-card.ts`): the change
 * directories the branch adds files to, in temporary repositories with a bare
 * `origin`; `recorded()` against the Notion stub of `work-take.fixture.ts`;
 * and the call in `finish()`, through `work-finish.fixture.ts`. The cursor
 * loop both Notion reads share (`paged()` of `notion-bot.ts`) is pinned here
 * too, so neither of its older test files grows.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, emptyDir, git, put } from "./diff-budget.fixture.ts";
import { type Call, client, paged } from "./notion-bot.ts";
import { added, changes, kind, recorded } from "./work-finish-card.ts";
import { checkout, finish, linked, pull } from "./work-finish.fixture.ts";
import { CARD, notion, page, type Stub, stopServers, TOKEN } from "./work-take.fixture.ts";

const API = process.env.HARNESS_NOTION_API_URL;
afterAll(() => {
	// Restored, so a later file in the same process reaches no stopped stub.
	if (API === undefined) delete process.env.HARNESS_NOTION_API_URL;
	else process.env.HARNESS_NOTION_API_URL = API;
	stopServers();
	cleanup();
});

const MANIFEST = JSON.stringify({ name: "harness", harness: { board: "Harness" } });
const FOO = "openspec/changes/foo/";
const ARCHIVE = "openspec/changes/archive/2026-11-02-foo/";
const PULL = { number: 7, url: "https://github.com/o/demo/pull/7" };

/** A checkout of `harness`, its board `Harness`, on `feature` past `main`, `base` and `head` its two trees. */
const tree = (base: Record<string, string>, head: Record<string, string | null>) => checkout(false, head, { "package.json": MANIFEST, ...base });
const adding = () => tree({}, { [`${FOO}proposal.md`]: "# foo\n" });
const archiving = () =>
	tree({ [`${FOO}proposal.md`]: "# foo\n", [`${FOO}tasks.md`]: "- [x] 1\n" }, {
		[`${FOO}proposal.md`]: null,
		[`${FOO}tasks.md`]: null,
		[`${ARCHIVE}proposal.md`]: "# foo\n",
		[`${ARCHIVE}tasks.md`]: "- [x] 1\n",
	});

/** `dir` with `origin`'s `main` replaced by a commit sharing no history with `feature`, so no merge base is found. */
function unrelated(dir: string): string {
	git(dir, "checkout", "-q", "--orphan", "other");
	git(dir, "commit", "-qm", "unrelated", "--allow-empty");
	git(dir, "push", "-q", "-f", "origin", "other:main");
	git(dir, "checkout", "-q", "feature");
	return dir;
}

describe("paged", () => {
	test("a second page of a path with no query is read behind `?start_cursor=`", async () => {
		const paths: string[] = [];
		const call = (async (_step: string, path: string) => {
			paths.push(path);
			return paths.length === 1 ? { results: [1], has_more: true, next_cursor: "c 1" } : { results: [2], has_more: false };
		}) as Call;
		expect(await paged(call, "the block read", "/v1/blocks/x/children")).toEqual([1, 2]);
		expect(paths).toEqual(["/v1/blocks/x/children", "/v1/blocks/x/children?start_cursor=c%201"]);
	});

	test("more pages behind no cursor name the step", async () => {
		const call = (async () => ({ results: [], has_more: true, next_cursor: null })) as Call;
		expect(await paged(call, "the block read", "/v1/blocks/x/children").then(() => "", (e: Error) => e.message)).toBe(
			"the block read gave no new cursor",
		);
	});
});

describe("the change directories the branch adds files to", () => {
	/** The change directories and the kind the branch at `top` gives. */
	const read = (top: string) => {
		const paths = added(top);
		return [changes(paths), kind(paths)];
	};

	// spec: work-finish/a-proposals-first-finish
	test("one change added", () => {
		expect(read(adding())).toEqual([[FOO], "proposal"]);
	});

	// spec: work-finish/an-archive-branch
	test("an archive, with renames on in the repository's config, names only the archived directory", () => {
		const dir = archiving();
		git(dir, "config", "diff.renames", "true");
		expect(read(dir)).toEqual([[ARCHIVE], "archive"]);
	});

	// spec: work-finish/an-apply-branch
	test("none, with tasks.md edited and code added", () => {
		expect(read(tree({ [`${FOO}tasks.md`]: "- [ ] 1\n" }, { [`${FOO}tasks.md`]: "- [x] 1\n", "bun/x.ts": "x\n" }))).toEqual([[], "apply"]);
	});

	// spec: work-finish/an-apply-branch-adding-a-delta-spec
	test("a delta spec alone added to a change the base holds: that change, kind apply", () => {
		const top = tree({ [`${FOO}proposal.md`]: "# foo\n" }, { [`${FOO}specs/x/spec.md`]: "# x\n", [`${FOO}notes.md`]: "n\n" });
		expect(read(top)).toEqual([[FOO], "apply"]);
	});

	// spec: work-finish/several-added-directories
	test("two", () => {
		expect(read(tree({}, { [`${FOO}proposal.md`]: "# foo\n", "openspec/changes/bar/proposal.md": "# bar\n" }))).toEqual([
			["openspec/changes/bar/", FOO],
			"proposal",
		]);
	});

	// spec: work-finish/a-main-that-archived-a-change-after-the-branch-forked
	test("a change archived on main after the fork, main merged in, is not read as added", () => {
		const dir = tree({ "openspec/changes/bar/proposal.md": "# bar\n" }, { [`${FOO}proposal.md`]: "# foo\n" });
		git(dir, "checkout", "-q", "main");
		put(dir, { "openspec/changes/bar/proposal.md": null, "openspec/changes/archive/2026-11-01-bar/proposal.md": "# bar\n" });
		git(dir, "add", "-A");
		git(dir, "commit", "-qm", "archive bar");
		git(dir, "push", "-q", "origin", "main");
		git(dir, "checkout", "-q", "feature");
		git(dir, "merge", "-q", "--no-edit", "main");
		expect(read(dir)[0]).toEqual([FOO]);
	});

	// spec: work-finish/a-proposals-second-half
	test("design.md and tasks.md added to a change the base holds name that change, kind proposal", () => {
		expect(read(tree({ [`${FOO}proposal.md`]: "# foo\n" }, { [`${FOO}design.md`]: "d\n", [`${FOO}tasks.md`]: "- [ ] 1\n" }))).toEqual([[FOO], "proposal"]);
	});

	test("a path git would quote is read as it is", () => {
		expect(read(tree({}, { "openspec/changes/fóo/proposal.md": "# fóo\n" }))[0]).toEqual(["openspec/changes/fóo/"]);
	});

	// As a shallow clone reads: no common history with origin/main.
	test("a main with no common history throws the merge base's step", () => {
		expect(() => added(unrelated(adding()))).toThrow(/^the merge base with origin\/main failed: /);
	});

	test("an origin whose main cannot be fetched throws", () => {
		const dir = adding();
		git(dir, "remote", "set-url", "origin", join(emptyDir(), "gone.git"));
		expect(() => added(dir)).toThrow(/^the fetch of origin\/main failed: /);
	});
});

type Block = { id: string; type: string; [key: string]: unknown };
const block = (id: string, type: string, text: string, href?: string): Block => ({ id, type, [type]: { rich_text: [{ plain_text: text, ...(href ? { href } : {}) }] } });
const para = (id: string, text: string) => block(id, "paragraph", text);
const LIST = "bulleted_list_item";
const item = (id: string, text: string) => block(id, LIST, text);
const ITEM = (k: string) => ({
	type: "bulleted_list_item",
	bulleted_list_item: { rich_text: [{ type: "text", text: { content: "#7", link: { url: PULL.url } } }, { type: "text", text: { content: ` — ${k}` } }] },
});
const POINTER = (content: string) => ({ properties: { Pointer: { rich_text: [{ text: { content } }] } } });

/** `recorded()` over the checkout `top` against a stub serving `stub`: its lines or the error, and the calls with their bodies. */
async function record(top: string, stub: Stub) {
	const api = notion(stub);
	process.env.HARNESS_NOTION_API_URL = api.url;
	const said = await recorded(client(TOKEN), CARD, top, PULL).then(
		(lines) => lines,
		(error: Error) => error.message,
	);
	return { said, calls: api.seen.map((s) => s.call), sent: (call: string) => api.seen.find((s) => s.call === call)?.body };
}
const PAGE = `PATCH /v1/pages/${CARD}`;
const APPEND = `PATCH /v1/blocks/${CARD}/children`;

describe("the Pointer", () => {
	// spec: work-finish/a-proposals-first-finish
	test("an empty one is written and read back", async () => {
		const run = await record(adding(), {});
		expect(run.sent(PAGE)).toEqual(POINTER(FOO));
		expect(run.calls).toContain("GET /v1/data_sources/ds1");
		expect(run.said).toContain(`finish: Pointer set to ${FOO}`);
	});

	// spec: work-finish/a-second-finish-on-the-same-pull-request
	test("one equal to the directory is left without a write", async () => {
		const run = await record(adding(), { page: page(FOO) });
		expect(run.calls).not.toContain(PAGE);
		expect(run.said).toContain(`finish: the Pointer already names ${FOO}`);
	});

	// spec: work-finish/an-archive-branch
	test.each([
		["the unarchived directory", FOO, ARCHIVE],
		["the cross-repository form, which keeps its prefix", `harness: ${FOO}`, `harness: ${ARCHIVE}`],
	])("%s is re-pointed to its archive", async (_, before, after) => {
		const run = await record(archiving(), { page: page(before) });
		expect(run.sent(PAGE)).toEqual(POINTER(after));
		expect((run.sent(APPEND) as { children: unknown[] }).children).toEqual([expect.anything(), ITEM("archive")]);
	});

	// spec: work-finish/a-fix-card
	test.each(["pr:350", "openspec/changes/bar/", `other: ${FOO}`])("%s is left, with a line saying so", async (before) => {
		const run = await record(adding(), { page: page(before) });
		expect(run.calls).not.toContain(PAGE);
		expect(run.said).toContain(`finish: the Pointer reads "${before}", not ${FOO}, so it is left`);
	});

	// spec: work-finish/a-card-on-another-repositorys-board
	test("an empty one on another repository's board takes the prefix", async () => {
		const run = await record(adding(), { board: "Mellon" });
		expect(run.sent(PAGE)).toEqual(POINTER(`harness: ${FOO}`));
	});

	// spec: work-finish/a-branch-whose-change-cannot-be-told
	test("a change the branch's history cannot tell writes nothing and says so", async () => {
		const dir = adding();
		git(dir, "remote", "set-url", "origin", join(emptyDir(), "gone.git"));
		const run = await record(dir, {});
		expect(run.said).toEqual([
			expect.stringMatching(/^finish: could not tell the branch's change, so the card's Pointer and link are left — the fetch of origin\/main failed: /),
		]);
		expect(run.calls).toEqual([]);
	});

	test("a page on no board throws before any write", async () => {
		const run = await record(adding(), { page: { ...page(), parent: { type: "page_id", page_id: "p" } } });
		expect(run.said).toBe(`${CARD} is not a card on a board`);
		expect(run.calls).toEqual([`GET /v1/pages/${CARD}`]);
	});

	// spec: work-finish/several-added-directories
	test("two directories write nothing and say so", async () => {
		const run = await record(tree({}, { [`${FOO}a.md`]: "a\n", "openspec/changes/bar/a.md": "a\n" }), {});
		expect(run.calls).not.toContain(PAGE);
		expect(run.said).toContain("finish: the branch adds files to 2 change directories, so the Pointer is left");
	});
});

describe("the link", () => {
	const anchored = async (blocks: Block[][]) => {
		const run = await record(adding(), { page: page(FOO), blocks });
		return { ...run, append: run.sent(APPEND) as { after?: string; children: unknown[] } | undefined };
	};

	test("goes after the last item directly under Ссылки, not a later section's", async () => {
		const run = await anchored([[para("s", "Summary"), para("a", "Ссылки"), item("i1", "#1"), item("i2", "#2"), para("p", "Позже"), item("j", "x")]]);
		expect(run.append).toEqual({ after: "i2", children: [ITEM("proposal")] });
		expect(run.said).toContain("finish: #7 linked under Ссылки as proposal");
	});

	test.each([
		["after the anchor when no item follows", [para("a", "Ссылки"), para("p", "Позже")], "a"],
		["under a heading_3", [block("a", "heading_3", "Ссылки"), item("i1", "#1")], "i1"],
		["under a `Ссылки: ` paragraph", [para("a", "Ссылки: "), item("i1", "#1")], "i1"],
		["past a blank paragraph inside the list", [para("a", "Ссылки"), para("b", " "), item("i1", "#1"), para("c", ""), para("p", "Позже")], "i1"],
		["past a link to another pull request whose number starts the same", [para("a", "Ссылки"), block("i1", LIST, "#70", `${PULL.url}0`)], "i1"],
	])("%s", async (_, blocks, after) => {
		expect((await anchored([blocks])).append?.after).toBe(after);
	});

	// spec: work-finish/a-proposals-first-finish
	test("with no Ссылки, a bold Ссылки paragraph and the item go at the end", async () => {
		const run = await anchored([[para("s", "Summary")]]);
		expect(run.append).toEqual({
			children: [{ type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Ссылки" }, annotations: { bold: true } }] } }, ITEM("proposal")],
		});
	});

	test("a second page of blocks is read", async () => {
		const run = await anchored([[para("s", "Summary")], [para("a", "Ссылки"), item("i1", "#1")]]);
		expect(run.calls).toContain(`GET /v1/blocks/${CARD}/children#1`);
		expect(run.append?.after).toBe("i1");
	});

	// spec: work-finish/a-second-finish-on-the-same-pull-request
	test.each([
		["an item's run", block("i1", LIST, "#7", PULL.url)],
		["a run in another case, to the files tab", block("i1", LIST, "#7", `${PULL.url.replace("o/demo", "O/Demo")}/files`)],
		["a bookmark", { id: "b", type: "bookmark", bookmark: { url: PULL.url, caption: [] } }],
	])("nothing is appended when %s already links the pull request", async (_, linking) => {
		const run = await anchored([[para("a", "Ссылки"), linking]]);
		expect(run.calls).not.toContain(APPEND);
		expect(run.said).toContain("finish: #7 is already linked on the card");
	});

	// spec: work-finish/a-write-notion-refuses
	test("a 403 on the append throws the step, after the Pointer write", async () => {
		const run = await record(adding(), { fail: { [APPEND]: 403 } });
		expect(run.said).toBe("the link's append answered 403");
		expect(run.calls.indexOf(PAGE)).toBeLessThan(run.calls.indexOf(APPEND));
	});
});

describe("finish", () => {
	const READY = "pr ready 7 -R o/demo";
	const DRAFT = { before: [pull(7, "OPEN", true)] };

	// spec: work-finish/a-proposals-first-finish
	test("a first finish on a branch adding a change writes both before the comments read", async () => {
		const cwd = adding();
		writeFileSync(join(cwd, "body.md"), "Body\n");
		const args = ["finish", "--card", CARD, "--title", "Demo", "--body-file", "body.md"];
		const run = await finish({ cwd, args, gh: { before: [], after: [pull(7, "OPEN", true)] }, stub: { blocks: [[]] } });
		expect(run.seen).toEqual([`GET /v1/pages/${CARD}`, "GET /v1/data_sources/ds1", PAGE, `GET /v1/blocks/${CARD}/children`, APPEND, "GET /v1/comments"]);
		expect([run.code, run.last]).toEqual([0, "finish: ready #7"]);
	});

	// spec: work-finish/a-second-finish-on-the-same-pull-request
	test("a second writes neither", async () => {
		const run = await finish({ cwd: adding(), gh: DRAFT, stub: { page: page(FOO), blocks: [[linked(7)]] } });
		expect(run.seen).toEqual([`GET /v1/pages/${CARD}`, `GET /v1/blocks/${CARD}/children`, "GET /v1/comments"]);
		expect(run.last).toBe("finish: ready #7");
	});

	// spec: work-finish/a-write-notion-refuses
	test("a refused write is said, and finish goes on to the question read and the ready switch", async () => {
		const run = await finish({ cwd: adding(), gh: DRAFT, stub: { blocks: [[]], fail: { [APPEND]: 403 } } });
		expect(run.out).toContain("finish: the card's record stopped, a rerun writes the rest — the link's append answered 403\n");
		expect(run.seen.at(-1)).toBe("GET /v1/comments");
		expect([run.code, run.last, run.calls.at(-1)]).toEqual([0, "finish: ready #7", READY]);
	});

	// spec: work-finish/a-branch-whose-change-cannot-be-told
	test("a merge base that cannot be found is said, and finish still marks ready", async () => {
		const run = await finish({ cwd: unrelated(adding()), gh: DRAFT });
		expect(run.out).toMatch(/^finish: could not tell the branch's change, so the card's Pointer and link are left — the merge base with origin\/main failed: /m);
		expect([run.code, run.last, run.seen]).toEqual([0, "finish: ready #7", ["GET /v1/comments"]]);
	});

	test("no --card makes no Notion call", async () => {
		const run = await finish({ cwd: adding(), args: ["finish"], gh: DRAFT });
		expect([run.seen, run.last]).toEqual([[], "finish: ready #7"]);
	});
});
