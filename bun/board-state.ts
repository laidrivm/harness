/**
 * The three statuses the file tree decides, and what each unapplied change is
 * waiting on. Filesystem in, JSON out: no network, no token and no connector,
 * so the whole of its behaviour is exercisable from a fabricated directory and
 * an agent is what carries its output to the board.
 *
 * It never reports the six statuses nobody can read from here — `idea`,
 * `exploring`, `explored`, `applying`, `applied`, `archiving` — nor anything
 * about a card on a board whose tree is not this repository. A derivation that
 * ran anyway would answer for them with the same confidence as the thirty it
 * is right about.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./root.ts";

export type Status = "done" | "proposed" | "proposing";

/** What a change declares it comes after, and which of those have not landed. */
export type Edges = { after: string[]; blocking: string[] };

export type State = {
	status: Record<string, Status>;
	edges: Record<string, Edges>;
};

/** The artefacts a complete change directory holds beside its `specs/`. */
const ARTEFACTS = ["proposal.md", "design.md", "tasks.md"];

/**
 * `<date>-<slug>`, the shape `openspec archive` gives a directory. Anchored at
 * both ends and the date counted out: a prefix match would read
 * `2026-08-01-archive` as covering `archive-preflight`, which is the collision
 * `openspec/specs/review-bot-config/spec.md` already documents in another tool.
 */
const ARCHIVED = /^\d{4}-\d{2}-\d{2}-(.+)$/;

const subdirs = (path: string): string[] =>
	lstatSync(path, { throwIfNoEntry: false })?.isDirectory()
		? readdirSync(path, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
		: [];

const isFile = (path: string) =>
	lstatSync(path, { throwIfNoEntry: false })?.isFile() === true;

/**
 * Whether `specs/` holds a delta spec — any markdown under it, at any depth,
 * which is the set `openspec status` resolves for the `specs` artefact. The
 * artefact is the delta and not the directory that would hold one, so an empty
 * `specs/` counts as absent.
 */
function delta(specs: string): boolean {
	if (!lstatSync(specs, { throwIfNoEntry: false })?.isDirectory()) return false;
	return readdirSync(specs, { withFileTypes: true, recursive: true }).some(
		(entry) => entry.isFile() && entry.name.endsWith(".md"),
	);
}

/**
 * The `after:` list one change declares. An absent key is an empty list and not
 * a defect — eleven of the seventeen carry none — and every other shape is one,
 * reported against the file rather than guessed at.
 */
function declared(path: string, named: string, problems: string[]): string[] {
	if (!isFile(path)) return [];
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(readFileSync(path, "utf8"));
	} catch (error) {
		problems.push(`${named}: not YAML — ${String(error)}`);
		return [];
	}
	// An empty document parses to nothing, which is a file declaring no
	// predecessor rather than a defect; eleven of the seventeen are that.
	if (parsed === null || parsed === undefined) return [];
	// Everything else has to be a mapping before `after` can be read off it. A
	// scalar or a sequence at the root answers `undefined` to any key, so
	// reading one would report a malformed file takeable — the one bad shape
	// this function would otherwise pass in silence.
	if (typeof parsed !== "object" || Array.isArray(parsed)) {
		problems.push(`${named}: the document is not a mapping of keys`);
		return [];
	}
	const after = (parsed as Record<string, unknown>).after;
	if (after === undefined || after === null) return [];
	// Reported by shape rather than iterated: YAML admits `after: a-slug`
	// silently, and a per-character walk yields slugs resolving to nothing,
	// which the unresolvable-slug report below would then blame on a typo in a
	// file whose real defect is that it holds a scalar.
	if (!Array.isArray(after)) {
		const shape =
			typeof after === "string" ? "a bare string" : `a ${typeof after}`;
		problems.push(`${named}: after: is ${shape} rather than a list of slugs`);
		return [];
	}
	const slugs: string[] = [];
	for (const entry of after) {
		if (typeof entry === "string") slugs.push(entry);
		else problems.push(`${named}: after: holds ${typeof entry}, not a slug`);
	}
	return slugs;
}

/**
 * Every cycle in the `after:` graph, each reported once however many of its
 * members the sweep reaches first. A self-edge is the one-member case and needs
 * no rule of its own.
 *
 * Reported rather than resolved: a cycle is an ordering nothing satisfies, and
 * leaving its members each blocked by the other reads as two tasks waiting for
 * work in progress rather than as an argument contradicting itself.
 */
function cycles(edges: Record<string, Edges>): string[][] {
	const found: string[][] = [];
	const named = new Set<string>();
	const settled = new Set<string>();
	const path: string[] = [];
	const walk = (slug: string) => {
		const at = path.indexOf(slug);
		if (at !== -1) {
			const ring = path.slice(at);
			const key = [...ring].sort().join(" ");
			if (!named.has(key)) {
				named.add(key);
				found.push([...ring, slug]);
			}
			return;
		}
		if (settled.has(slug)) return;
		path.push(slug);
		for (const next of edges[slug]?.after ?? []) walk(next);
		path.pop();
		settled.add(slug);
	};
	for (const slug of Object.keys(edges)) walk(slug);
	return found;
}

/**
 * What the tree says about every slug it can see, and what each unapplied
 * change is waiting on.
 *
 * Throws rather than returning a half-answer: every problem below is a tree an
 * agent must not carry to the board, and a state object holding both the
 * answer and the complaint invites the answer being read on its own.
 */
export function boardState(tree: string): State {
	// `tree` rather than `root`, which this module imports for its own entry
	// point below: a parameter shadowing that import reads as the repository
	// root in a function whose whole point is to answer for a fabricated one.
	const changes = join(tree, "openspec/changes");
	const problems: string[] = [];
	// Prototype-free, because every key below is a directory name off the
	// filesystem: `status["__proto__"] = "proposed"` on a plain object calls
	// the inherited setter, stores nothing, and drops that slug in silence.
	// The same reason `Object.hasOwn` reads them a few lines down.
	const status: Record<string, Status> = Object.create(null);

	const unapplied = subdirs(changes).filter((name) => name !== "archive");
	for (const slug of unapplied) {
		const dir = join(changes, slug);
		const whole =
			ARTEFACTS.every((name) => isFile(join(dir, name))) &&
			delta(join(dir, "specs"));
		status[slug] = whole ? "proposed" : "proposing";
	}

	for (const name of subdirs(join(changes, "archive"))) {
		const slug = ARCHIVED.exec(name)?.[1];
		if (slug === undefined) {
			problems.push(
				`openspec/changes/archive/${name}: not <date>-<slug>, so it names no change`,
			);
			continue;
		}
		// `done` whatever else the tree holds: a slug with a directory in both
		// places is a change archived and since reopened, and the archive is the
		// later fact about it.
		status[slug] = "done";
	}

	const edges: Record<string, Edges> = Object.create(null);
	for (const slug of unapplied) {
		const named = `openspec/changes/${slug}/.openspec.yaml`;
		const after = declared(
			join(changes, slug, ".openspec.yaml"),
			named,
			problems,
		);
		for (const entry of after) {
			// `hasOwn`, not `in`: every object inherits `toString`, `constructor`
			// and `valueOf`, so `in` would resolve an `after:` naming any of those
			// against a tree holding no such change.
			if (entry !== slug && !Object.hasOwn(status, entry))
				problems.push(
					`${named}: after: names ${entry}, which has no directory under openspec/changes/ or its archive`,
				);
		}
		edges[slug] = {
			after,
			blocking: after.filter((entry) => status[entry] !== "done"),
		};
	}

	for (const ring of cycles(edges))
		problems.push(
			`${ring.join(" → ")}: an after: cycle, which no order satisfies`,
		);

	if (problems.length > 0)
		throw new Error(
			["the tree does not derive a board state:", ...problems].join("\n"),
		);
	return { status, edges };
}

if (import.meta.main) console.log(JSON.stringify(boardState(root), null, "\t"));
