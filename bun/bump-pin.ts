/**
 * The harness pin in a consumer's `package.json`, read and moved as text. As
 * text and not by re-serialising the manifest, so the diff is the pin's one
 * line whatever the file's indentation and key order. Not by `bun add`,
 * which in bun 1.4.2 left the old pin in `bun.lock` beside the new one.
 */

/** The only spec a bump moves: the harness on GitHub, at a full commit. */
const SPEC = /^github:laidrivm\/harness#([0-9a-f]{40})$/;

/** The commit `text`'s `dependencies.harness` pins, or a throw naming why not. */
export function pinOf(text: string): string {
	const harness = (
		JSON.parse(text) as { dependencies?: Record<string, unknown> }
	).dependencies?.harness;
	if (typeof harness !== "string")
		throw new Error("package.json: no dependencies.harness to move");
	const sha = SPEC.exec(harness)?.[1];
	if (sha === undefined)
		throw new Error(
			`package.json: dependencies.harness is ${harness}, not github:laidrivm/harness#<40-hex>`,
		);
	return sha;
}

/**
 * `text` with its harness pin moved to `sha`. The old spec must occur exactly
 * once, so the replacement cannot touch anything but the dependency, and the
 * result is parsed back to confirm the dependency is what moved.
 */
export function movePin(text: string, sha: string): string {
	if (!/^[0-9a-f]{40}$/.test(sha))
		throw new Error(`${sha} is not a full commit hash`);
	const old = `github:laidrivm/harness#${pinOf(text)}`;
	const quoted = JSON.stringify(old);
	const count = text.split(quoted).length - 1;
	if (count !== 1)
		throw new Error(`package.json: ${old} occurs ${count} times, not once`);
	const next = JSON.stringify(`github:laidrivm/harness#${sha}`);
	const moved = text.replace(quoted, next);
	if (pinOf(moved) !== sha)
		throw new Error(`package.json: moving ${old} did not move the dependency`);
	return moved;
}
