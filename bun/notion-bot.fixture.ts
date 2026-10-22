/**
 * The runner's Notion settings, for the pass cases of
 * `board-loop-question.test.ts` and `notion-triage-pass.test.ts`: a home
 * holding the settings files, and the values written into them.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDir } from "./diff-budget.fixture.ts";

export const TOKEN = "ntn_secret0value";
export const USER = "0123456789abcdef0123456789abcdef";
export const CARD = "aaaabbbbccccddddeeeeffff00001111";

/** A runner home holding each settings file named, at `mode`. */
export function configured(mode = 0o600, ...names: string[]) {
	const home = emptyDir("board-loop-home-");
	mkdirSync(join(home, ".config/harness"), { recursive: true });
	for (const name of names.length ? names : ["notion-bot.json"]) {
		const file = join(home, ".config/harness", name);
		writeFileSync(file, JSON.stringify({ token: TOKEN, user: USER }));
		chmodSync(file, mode);
	}
	return home;
}
