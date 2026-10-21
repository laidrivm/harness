/**
 * The GitHub App the board loop's runner pushes as, and `pr-sweep.ts` writes
 * as, when its environment names one: `HARNESS_GITHUB_APP_ID` and
 * `HARNESS_GITHUB_APP_KEY`, the path of the
 * App's private key. Everything else is asked of the API at `GITHUB_API_URL`,
 * read as `bump.ts` reads it: the bot's identity before any session, and an
 * installation token for the clone's repository alone after the stage session,
 * so no session ever holds one.
 */
import { createPrivateKey, type KeyObject, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { remoteRepository } from "./pull-requests.ts";

export type App = { id: string; key: KeyObject; owner: string; repo: string };

/** The owner and name a GitHub URL names, HTTPS, SSH or `ssh://`, or undefined for any other. */
export function repository(url: string) {
	// GitHub's host alone, then exactly two segments: a token must never go to a proxy.
	const github = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)[^/]+\/[^/]+$/;
	return github.test(url) ? remoteRepository(url) : undefined;
}

/**
 * The App the environment names, or undefined when it names none. Throws
 * naming the setting or the remote at fault, never the key's contents or
 * `origin`'s URL, which can hold a credential.
 */
export function configured(env: NodeJS.ProcessEnv, origin: string): App | undefined {
	const { HARNESS_GITHUB_APP_ID: id, HARNESS_GITHUB_APP_KEY: path } = env;
	if (id === undefined && path === undefined) return undefined;
	const blank = (name: string, value?: string) =>
		new Error(`${name} is ${value === undefined ? "unset" : "blank"} — set both App settings, or neither`);
	if (!id?.trim()) throw blank("HARNESS_GITHUB_APP_ID", id);
	if (!path?.trim()) throw blank("HARNESS_GITHUB_APP_KEY", path);
	if (!/^\d+$/.test(id)) throw new Error("HARNESS_GITHUB_APP_ID is no number");
	let key: KeyObject;
	try {
		key = createPrivateKey(readFileSync(path));
	} catch {
		throw new Error(`HARNESS_GITHUB_APP_KEY names ${path}, which holds no private key this user can read`);
	}
	const repo = repository(origin);
	if (!repo) throw new Error("origin's URL names no GitHub repository");
	return { id, key, ...repo };
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** The App's JWT: RS256, through `node:crypto`, which reads the PKCS#1 key GitHub issues as it is. */
export function jwt(id: string, key: KeyObject, now = Math.floor(Date.now() / 1000)) {
	// 60 s back for clock drift, as GitHub advises; 540 s on stays inside its ten-minute cap.
	const claims = { iat: now - 60, exp: now + 540, iss: id };
	const data = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
	return `${data}.${base64url(sign("sha256", Buffer.from(data), key))}`;
}

/** One API call's answer, `field` of it, which must be `type`; anything else throws naming the path. */
async function call(path: string, field: string, type: "string" | "number", bearer?: string, body?: unknown) {
	const headers: Record<string, string> = { accept: "application/vnd.github+json" };
	if (bearer) headers.authorization = `Bearer ${bearer}`;
	const url = `${process.env.GITHUB_API_URL ?? "https://api.github.com"}${path}`;
	// Bounded, so a stalled API ends the pass rather than holding it.
	const signal = AbortSignal.timeout(30_000);
	const init = { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, signal };
	const answer = await fetch(url, init).catch((error: Error) => {
		throw new Error(`GitHub's API could not be reached for ${path}: ${error.message}`);
	});
	if (!answer.ok) throw new Error(`GitHub's API answered ${path} with ${answer.status}`);
	const value = ((await answer.json().catch(() => ({}))) as Record<string, unknown>)[field];
	if (typeof value !== type) throw new Error(`GitHub's API answered ${path} with no ${field}`);
	return String(value);
}

/** The App's slug, from `GET /app`: its pull requests' author is `app/<slug>`, its commits' `<slug>[bot]`. */
export const slug = (app: App) => call("/app", "slug", "string", jwt(app.id, app.key));

/** The `GIT_*` variables that author and commit a session's work as the App's bot user. */
export async function identity(app: App): Promise<Record<string, string>> {
	const name = `${await slug(app)}[bot]`;
	const email = `${await call(`/users/${encodeURIComponent(name)}`, "id", "number")}+${name}@users.noreply.github.com`;
	return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

/** An installation token for the App's one repository, holding the `permissions` its caller names and no more. */
export async function mint(app: App, permissions: Record<string, "read" | "write">): Promise<string> {
	const bearer = jwt(app.id, app.key);
	const installation = await call(`/repos/${app.owner}/${app.repo}/installation`, "id", "number", bearer);
	return call(`/app/installations/${installation}/access_tokens`, "token", "string", bearer, {
		repositories: [app.repo],
		permissions,
	});
}

/**
 * The variables that push and open as the App: git's extra header and `gh`'s
 * `GH_TOKEN`. An environment is readable by its own user alone, where an
 * argument or a URL holding the token shows in `ps` to every user.
 * shortcut: entry 0 replaces any `GIT_CONFIG_*` the runner was started with;
 * append after its count if a runner ever needs its own.
 */
export const credentials = (token: string) => ({
	GH_TOKEN: token,
	GIT_CONFIG_COUNT: "1",
	GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
	GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
});
