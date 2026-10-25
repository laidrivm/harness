/**
 * The harness pin in a `package.json`, read and moved as text. As text and
 * not by re-serialising the manifest, so the diff is the pin's lines whatever
 * the file's indentation and key order. Not by `bun add`, which in bun 1.4.2
 * left the old pin in `bun.lock` beside the new one.
 *
 * A consumer pins the harness under `dependencies`; the harness pins itself
 * under `devDependencies`. Both fields are read in that order, the one
 * `NOTICE` in `bootstrap.ts` uses, so one rule decides which pin a manifest has.
 */

/** The only spec a bump moves: the harness on GitHub, at a full commit. */
const SPEC = /^github:laidrivm\/harness#([0-9a-f]{40})$/;

/** The two fields a harness pin may sit in, in the order they are read. */
const FIELDS = ["dependencies", "devDependencies"] as const;

type Manifest = Partial<Record<(typeof FIELDS)[number], Record<string, unknown>>>;

/** The harness spec under each of the two fields, `undefined` where none. */
function harnessFields(text: string): unknown[] {
	const manifest = JSON.parse(text) as Manifest;
	return FIELDS.map((field) => manifest[field]?.harness);
}

/** The commit `text`'s pin names, or a throw naming why not. */
export function pinOf(text: string): string {
	const specs = harnessFields(text);
	const at = specs.findIndex((spec) => spec != null);
	const harness = specs[at];
	if (typeof harness !== "string")
		throw new Error(
			"package.json: no dependencies.harness or devDependencies.harness to move",
		);
	const sha = SPEC.exec(harness)?.[1];
	if (sha === undefined)
		throw new Error(
			`package.json: ${FIELDS[at]}.harness is ${harness}, not github:laidrivm/harness#<40-hex>`,
		);
	return sha;
}

/**
 * `text` with its harness pin moved to `sha`, in each of the two fields that
 * holds the old spec. The old spec must occur exactly that many times, so the
 * replacement cannot touch anything outside those fields, and the result is
 * parsed back to confirm each of them is what moved. A field holding another
 * spec is left as it is.
 */
export function movePin(text: string, sha: string): string {
	if (!/^[0-9a-f]{40}$/.test(sha))
		throw new Error(`${sha} is not a full commit hash`);
	const old = `github:laidrivm/harness#${pinOf(text)}`;
	const holding = harnessFields(text).map((spec) => spec === old);
	const expected = holding.filter(Boolean).length;
	const quoted = JSON.stringify(old);
	const count = text.split(quoted).length - 1;
	if (count !== expected)
		throw new Error(
			`package.json: ${old} occurs ${count} times, not ${expected === 1 ? "once" : `${expected} times`}`,
		);
	const next = `github:laidrivm/harness#${sha}`;
	const moved = text.replaceAll(quoted, JSON.stringify(next));
	const after = harnessFields(moved);
	if (holding.some((held, i) => held && after[i] !== next))
		throw new Error(`package.json: moving ${old} did not move the dependency`);
	return moved;
}
