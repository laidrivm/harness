#!/usr/bin/env bun
/**
 * One sweep over a repository's open agent pull requests:
 * `bun bun/pr-sweep.ts <owner>/<repo>`. It updates a branch behind its base,
 * hands off what needs an agent or the CI flow as one JSON line per pull
 * request on standard output, and marks each head it judged with the
 * `harness/sweep` status, so the next run hands off no kind twice at one SHA
 * (`openspec/changes/pr-sweep/design.md`).
 *
 * It reads no clone and takes no lock: every call names the repository, and
 * the drift check writes only temporary directories it removes. It re-runs no
 * CI. Group 1 runs with the inherited `gh` credential; nothing starts it yet.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinOf } from "./bump-pin.ts";
import { limit } from "./pull-requests.ts";
import { drift } from "./sync.ts";

const NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const FIELDS = "number,headRefName,headRefOid,baseRefName,author,isCrossRepository,isDraft,mergeable,statusCheckRollup";
const CONTEXT = "harness/sweep";
const HARNESS = "laidrivm/harness";
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

type Kind = "conflict" | "drift" | "ci" | "description";
type Handoff = { kind: Kind; to: "agent" | "ciflow"; detail: string[] };
type Check = {
	name?: string;
	workflowName?: string;
	status?: string;
	conclusion?: string;
	startedAt?: string | null;
	context?: string;
	state?: string;
};
type Pull = {
	number: number;
	headRefName: string;
	headRefOid: string;
	baseRefName: string;
	author?: { login?: string };
	isCrossRepository: boolean;
	isDraft: boolean;
	mergeable: string;
	statusCheckRollup?: Check[];
};
/** What judging one head comes to: its line's outcome, and the mark to write after it, if any. */
type Verdict = { outcome: string; reason?: string; handoffs?: Handoff[]; mark?: string };

/** One `gh` call, killed at the limit `pull-requests.ts` applies; `err` is never empty on a failure. */
function gh(...args: string[]) {
	const p = Bun.spawnSync(["gh", ...args], { timeout: limit(), killSignal: "SIGKILL" });
	const err = p.stderr.toString().trim() || `gh ${args.slice(0, 2).join(" ")} exited ${p.exitCode ?? "on a signal"}`;
	return { ok: p.exitCode === 0, out: p.stdout.toString(), err };
}

const notFound = (err: string) => err.includes("(HTTP 404)");

/** The parsed JSON of a `gh api` call, or a throw with its error. */
function api<T>(path: string): T {
	const r = gh("api", path);
	if (!r.ok) throw new Error(r.err);
	return JSON.parse(r.out) as T;
}

/** A file's bytes from the contents API, which sends them as base64. */
const bytes = (path: string) => Buffer.from(api<{ content: string }>(path).content, "base64");

/** Writes into `into` every file directly under `path` at `ref` whose name `only` takes; a 404 is an empty directory where `empty`. */
function fetchDir(repo: string, path: string, ref: string, into: string, only: RegExp, empty: boolean) {
	mkdirSync(into);
	const listed = gh("api", `repos/${repo}/contents/${path}?ref=${ref}`);
	if (!listed.ok) {
		if (empty && notFound(listed.err)) return;
		throw new Error(listed.err);
	}
	for (const entry of JSON.parse(listed.out) as { name: string; type: string }[])
		if (entry.type === "file" && only.test(entry.name))
			writeFileSync(join(into, entry.name), bytes(`repos/${repo}/contents/${path}/${entry.name}?ref=${ref}`));
}

/** `drift`'s problems for the head's `harness/` against the pinned `core/`, or none where nothing is pinned under `dependencies`. */
function driftAt(repo: string, sha: string): string[] {
	const pkg = gh("api", `repos/${repo}/contents/package.json?ref=${sha}`);
	if (!pkg.ok) {
		if (notFound(pkg.err)) return [];
		throw new Error(pkg.err);
	}
	const text = Buffer.from((JSON.parse(pkg.out) as { content: string }).content, "base64").toString();
	if ((JSON.parse(text) as { dependencies?: { harness?: unknown } }).dependencies?.harness === undefined) return [];
	const pin = pinOf(text);
	const dir = mkdtempSync(join(tmpdir(), "pr-sweep-"));
	try {
		fetchDir(HARNESS, "core", pin, join(dir, "core"), /\.md$/, false);
		fetchDir(repo, "harness", sha, join(dir, "copy"), /./, true);
		return drift(join(dir, "core"), join(dir, "copy"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Each check's verdict by its latest run: an unstarted run is the latest, and on a tie pending wins, then failed. */
function checks(rollup: Check[]) {
	const RANK = { passed: 0, failed: 1, pending: 2 };
	const latest = new Map<string, { at: string; verdict: keyof typeof RANK }>();
	for (const c of rollup) {
		if (c.context !== undefined) {
			// A status's rollup entry is already its latest state.
			if (c.context !== CONTEXT)
				latest.set(c.context, {
					at: "",
					verdict: c.state === "SUCCESS" ? "passed" : c.state === "PENDING" || c.state === "EXPECTED" ? "pending" : "failed",
				});
			continue;
		}
		const key = c.workflowName ? `${c.workflowName} / ${c.name}` : `${c.name}`;
		const verdict = c.status !== "COMPLETED" ? "pending" : PASSED.has(c.conclusion ?? "") ? "passed" : "failed";
		const at = c.startedAt ?? "￿";
		const seen = latest.get(key);
		if (!seen || at > seen.at || (at === seen.at && RANK[verdict] > RANK[seen.verdict])) latest.set(key, { at, verdict });
	}
	const named = (v: string) => [...latest].filter(([, c]) => c.verdict === v).map(([key]) => key);
	return { any: latest.size > 0, pending: named("pending"), failed: named("failed") };
}

/** Whether the head merges the base into the branch: two parents, the second already in the base. */
function mergesBase(repo: string, pr: Pull): boolean {
	const parents = api<{ parents: { sha: string }[] }>(`repos/${repo}/commits/${pr.headRefOid}`).parents;
	return parents.length === 2 && api<{ ahead_by: number }>(`repos/${repo}/compare/${pr.baseRefName}...${parents[1].sha}`).ahead_by === 0;
}

const describe = (kinds: string[]) => (kinds.length ? `handed off: ${kinds.join(", ")}` : "nothing to hand off");
const to = (kind: Kind, detail: string[] = []): Handoff => ({ kind, to: kind === "ci" ? "ciflow" : "agent", detail });

/** The kinds a marked head's status names, read only when a hand-off would follow. */
function markedKinds(repo: string, sha: string): string[] {
	const own = api<{ statuses: { context: string; description?: string }[] }>(`repos/${repo}/commits/${sha}/status`).statuses.find(
		(s) => s.context === CONTEXT,
	);
	const said = own?.description ?? "";
	return said.startsWith("handed off: ") ? said.slice("handed off: ".length).split(", ") : [];
}

/** One head, in `design.md`'s order of judgement; a marked head skips drift and the description. */
function judge(repo: string, pr: Pull): Verdict {
	if (pr.isDraft) return { outcome: "skipped", reason: "draft" };
	const rollup = pr.statusCheckRollup ?? [];
	const marked = rollup.some((c) => c.context === CONTEXT);
	if (pr.mergeable === "UNKNOWN") return { outcome: "waiting", reason: "mergeability" };
	const give: Handoff[] = [];
	if (pr.mergeable === "CONFLICTING") give.push(to("conflict"));
	else {
		if (api<{ behind_by: number }>(`repos/${repo}/compare/${pr.baseRefName}...${pr.headRefOid}`).behind_by > 0) {
			const update = gh("pr", "update-branch", String(pr.number), "--repo", repo);
			return update.ok ? { outcome: "updated" } : { outcome: "failed", reason: update.err };
		}
		const problems = marked ? [] : driftAt(repo, pr.headRefOid);
		if (problems.length) give.push(to("drift", problems));
		else {
			const ci = checks(rollup);
			if (ci.pending.length) return { outcome: "waiting", reason: ci.pending.join(", ") };
			if (!ci.any) return { outcome: "waiting", reason: "no checks" };
			if (ci.failed.length) give.push(to("ci", ci.failed));
			else if (!marked && !mergesBase(repo, pr)) give.push(to("description"));
		}
	}
	if (!marked) return { outcome: "marked", handoffs: give, mark: describe(give.map((h) => h.kind)) };
	if (!give.length) return { outcome: "skipped", reason: "marked" };
	const before = markedKinds(repo, pr.headRefOid);
	const fresh = give.filter((h) => !before.includes(h.kind));
	if (!fresh.length) return { outcome: "skipped", reason: "marked" };
	return { outcome: "marked", handoffs: fresh, mark: describe([...before, ...fresh.map((h) => h.kind)]) };
}

function main(argv: string[]): number {
	const repo = argv[0] ?? "";
	if (argv.length !== 1 || !NAME.test(repo) || /\/\.\.?$/.test(repo)) {
		console.error(`usage: bun bun/pr-sweep.ts <owner>/<repo> — not one: ${JSON.stringify(argv)}`);
		return 2;
	}
	// Read before any App token is set, so it is the credential's own login.
	const user = gh("api", "user", "--jq", ".login");
	if (!user.ok) {
		console.error(`pr-sweep: the credential's login could not be read, and no App is configured — ${user.err}`);
		return 1;
	}
	const login = user.out.trim();
	const listed = gh("pr", "list", "--repo", repo, "--state", "open", "--limit", "1000", "--json", FIELDS);
	let pulls: unknown;
	try {
		pulls = listed.ok ? JSON.parse(listed.out) : undefined;
	} catch {
		// Not JSON: the listing failed, below.
	}
	if (!Array.isArray(pulls)) {
		console.error(`pr-sweep: the listing of ${repo} failed — ${listed.err}`);
		return 1;
	}
	let code = 0;
	for (const pr of pulls as Pull[]) {
		const agent = /^(feat|spec)\//.test(pr.headRefName) && !pr.isCrossRepository && pr.author?.login === login;
		if (!agent) continue;
		let verdict: Verdict;
		try {
			verdict = judge(repo, pr);
		} catch (e) {
			verdict = { outcome: "failed", reason: e instanceof Error ? e.message : String(e) };
		}
		const { mark, ...line } = verdict;
		console.log(JSON.stringify({ repo, pr: pr.number, branch: pr.headRefName, sha: pr.headRefOid, ...line, handoffs: line.handoffs ?? [] }));
		if (verdict.outcome === "failed") code = 1;
		if (mark === undefined) continue;
		const status = gh("api", "-X", "POST", `repos/${repo}/statuses/${pr.headRefOid}`, "-f", "state=success", "-f", `context=${CONTEXT}`, "-f", `description=${mark}`);
		if (!status.ok) {
			console.error(`pr-sweep: #${pr.number} at ${pr.headRefOid}: the mark was not written — ${status.err}`);
			code = 1;
		}
	}
	return code;
}

process.exit(main(process.argv.slice(2)));
