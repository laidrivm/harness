/**
 * What `command-guard.ts` refuses of a process signal the session may not
 * own: `pkill` and its kin anywhere (`killByName`), and a `kill` aimed past a
 * job of the line's own shell (`killSignal`). Both read a command's words
 * rather than an invocation, so no prefix hides one. Each returns the reason
 * rather than blocking, as `command-guard-exec.ts`'s checks do.
 */

import { REDIRECTION } from "./command-guard-exec.ts";
import { FED } from "./command-parse.ts";
import { base, named, OPEN_REDIRECTION } from "./command-words.ts";

/** One reason for both signal checks (kill-guard D4). */
const SIGNAL =
	"command-guard: this command may signal a process the session did not start. `pkill`, `killall`, `killall5` and `skill` pick theirs by name across the machine, and `kill` passes only as the command's own name, with literal job specs (`%1`) or, after `-0`, plain numeric pids. Stop a background task you started with TaskStop; a job this same line started with `&` is `kill %N`; any other process is not the session's to signal — ask the user. The bare word is matched anywhere, so search for it with a quoted pattern such as `'[k]ill'`.";

const BY_NAME = new Set(["pkill", "killall", "killall5", "skill"]);

/**
 * Why `part` holds a word naming `pkill`, `killall`, `killall5` or `skill`,
 * or nothing. A word anywhere, not a command name: a prefix the guard does
 * not know (`noglob`, `setsid`, `find -exec`) would otherwise hide it, and a
 * list of prefixes is the enumeration kill-guard D2 rejects.
 */
export function killByName(part: string[]): string | undefined {
	return part.some((word) => BY_NAME.has(base(word))) ? SIGNAL : undefined;
}

/**
 * Why `part` holds the word `kill` aimed past a job of the line's own shell,
 * or nothing (kill-guard D2, D3). `kill` must be the command's name with no
 * prefix — `xargs`, `watch` and the like append or rewrite its words — and no
 * substitution may feed the command. Its words are read raw, redirections
 * included: an open one is refused, since quoted it is a word `kill` gets and
 * the next word reaches `kill` as a pid (`kill '<' 95034`).
 */
export function killSignal(part: string[]): string | undefined {
	const at = part.findIndex((word) => base(word) === "kill");
	if (at === -1) return undefined;
	if (FED.has(part) || part.findIndex((_, index) => named(part, index)) !== at) return SIGNAL;
	const words: string[] = [];
	for (const word of part.slice(at + 1)) {
		if (OPEN_REDIRECTION.test(word)) return SIGNAL;
		if (!REDIRECTION.test(word)) words.push(word);
	}
	let next = 0;
	const first = words[0] ?? "";
	if (first === "-s" || first === "-n") {
		if (!/^[A-Za-z0-9]+$/.test(words[1] ?? "")) return SIGNAL;
		next = 2;
	} else if (/^-[A-Za-z0-9]+$/.test(first)) next = 1;
	if (words[next] === "--") next++;
	// After `-0` a pid is only probed; a `-9` there would be a process group.
	const operand = first === "-0" ? /^[0-9]+$/ : /^%[A-Za-z0-9_+%-]*$/;
	return words.slice(next).every((word) => operand.test(word)) ? undefined : SIGNAL;
}
