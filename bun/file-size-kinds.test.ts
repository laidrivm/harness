/**
 * What kind of file each tracked path is, and whether somebody has ruled on
 * that kind — the other half of `file-size.test.ts`, which asks how long a
 * file is rather than what it is.
 *
 * The ruling itself — that every kind a tree carries has been decided on — is
 * read over a consumer's tree, not this repository's, whose kinds are not the
 * ones the caps were set for.
 */
import { describe, expect, test } from "bun:test";

/**
 * What kind of file a path is, for that ruling: its extension where it has
 * one, its own name where it has none. Read off the name rather than the path,
 * and answered with the whole name rather than an index — the last dot's index
 * over a path made a name carrying no dot report its final character
 * (`Dockerfile` ruling as `e`, joined in silence by every other extensionless
 * name) and a name under a dotted directory report the whole path.
 */
const extension = (path: string) => {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? name : name.slice(dot);
};

describe("what kind of file a path is", () => {
	test.each([
		["src/model.ts", ".ts"],
		[".env.example", ".example"],
		// No dot at all: the name, never its last character.
		["Dockerfile", "Dockerfile"],
		// A dot that opens the name rather than separating an extension.
		[".gitignore", ".gitignore"],
		// The only dot is in a directory: the path is not what is ruled on.
		[".github/workflows/deploy", "deploy"],
	])("%s is ruled as %s", (path, kind) => expect(extension(path)).toBe(kind));
});
