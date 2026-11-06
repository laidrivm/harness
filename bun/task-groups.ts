/**
 * The task-list reading the turn gate, the goal check, `work-status.ts` and
 * the board loop share: a `tasks.md`'s `## ` groups and their boxes.
 */

type Boxes = { ticked: number; open: number };

/**
 * Every `## ` group of a task list with its boxes counted. A box inside a
 * fenced code block is an example, not a task. The goal check reads a step's
 * group by its place in this order.
 */
export function groups(text: string): Map<string, Boxes> {
	const found = new Map<string, Boxes>();
	let group: Boxes | undefined;
	let fence: string | undefined;
	for (const line of text.split("\n")) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0];
		if (marker && (!fence || marker === fence)) {
			fence = fence ? undefined : marker;
			continue;
		}
		if (fence) continue;
		const heading = /^## (.+?)\s*$/.exec(line)?.[1];
		if (heading !== undefined) {
			group = { ticked: 0, open: 0 };
			found.set(heading, group);
			continue;
		}
		const box = /^\s*[-*] \[([ xX])\]/.exec(line);
		if (box && group) box[1] === " " ? group.open++ : group.ticked++;
	}
	return found;
}

/**
 * Headings of the groups with at least one box and no unticked one — a group
 * with no boxes at all has no evidence that one was ticked.
 */
export function complete(text: string): string[] {
	return [...groups(text)].filter(([, b]) => b.ticked > 0 && b.open === 0).map(([heading]) => heading);
}
