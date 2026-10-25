#!/usr/bin/env bun
/**
 * The key holder's mint (`runner-isolation` *The key holder*): the one program
 * the key-holder user runs, through sudo, from the image's root-owned copy of
 * `bun/`, never the runner's checkout. It alone reads the App's private key.
 *
 *   github-app-mint.ts <owner>/<repo> <permission>=<level>…   prints one installation token
 *   github-app-mint.ts <owner>/<repo> --slug                  prints the App's slug
 *
 * It refuses, before any call, a repository its root-owned list does not name
 * and a permission or level outside the fixed set, naming each, and exits 2;
 * a call that fails exits 1, or 75 (`TEMPFAIL`) when it got no answer, timed
 * out or was answered 5xx or 429. Only the answer goes to stdout, where the
 * runner's `minted()` reads it, so the token is in no process's arguments.
 */
import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { type App, mint, slug } from "./github-app.ts";
import { TEMPFAIL, Transient } from "./transient.ts";

/** The levels each permission may be asked at, and no others: `design.md` *The key holder*. */
const ALLOWED: Record<string, string[]> = {
	contents: ["read", "write"],
	pull_requests: ["read", "write"],
	statuses: ["read", "write"],
	actions: ["read"],
	checks: ["read"],
};

/**
 * Where the image provisions them (`runner-isolation` group 5): the App's id
 * and the list of `<owner>/<repo>` lines, root's; the key, the key holder's own.
 */
export const FILES = {
	id: "/etc/orchestrator/app/id",
	repositories: "/etc/orchestrator/app/repositories",
	key: "/var/lib/orchestrator-key/app.pem",
};

type Result = { code: number; out: string; err: string };
const refused = (why: string): Result => ({ code: 2, out: "", err: `github-app-mint: ${why}\n` });

export async function main(args: string[], files = FILES): Promise<Result> {
	const [named = "", ...asked] = args;
	const wanted = named.toLowerCase();
	const listed = readFileSync(files.repositories, "utf8").split("\n").map((line) => line.trim().toLowerCase());
	// A whole name, two segments: a dot path or an extra segment would move the API call out of the repository.
	if (!/^[\w.-]+\/[\w.-]+$/.test(wanted) || wanted.split("/").some((part) => /^\.+$/.test(part)) || !listed.includes(wanted))
		return refused(`${named || "no repository"} is no repository the list names`);
	const permissions: Record<string, "read" | "write"> = {};
	const slugOnly = asked.length === 1 && asked[0] === "--slug";
	if (!slugOnly) {
		for (const word of asked) {
			const [name, level, extra] = word.split("=");
			// Own keys alone: `constructor` or `__proto__` would read the prototype's.
			if (extra !== undefined || !Object.hasOwn(ALLOWED, name) || !ALLOWED[name].includes(level)) return refused(`${word} is outside the fixed set of permissions`);
			permissions[name] = level as "read" | "write";
		}
		// None asked would mint every permission the App holds.
		if (!asked.length) return refused("no permission was asked for");
	}
	const [owner, repo] = wanted.split("/");
	try {
		const app: App = { id: readFileSync(files.id, "utf8").trim(), key: createPrivateKey(readFileSync(files.key)), owner, repo };
		return { code: 0, out: `${slugOnly ? await slug(app) : await mint(app, permissions)}\n`, err: "" };
	} catch (error) {
		return { code: error instanceof Transient ? TEMPFAIL : 1, out: "", err: `github-app-mint: ${(error as Error).message}\n` };
	}
}

if (import.meta.main) {
	const { code, out, err } = await main(process.argv.slice(2));
	process.stdout.write(out);
	process.stderr.write(err);
	process.exit(code);
}
