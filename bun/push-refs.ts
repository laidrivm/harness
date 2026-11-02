/**
 * The one parser of the ref-update records git hands a pre-push hook on
 * standard input, `<local ref> <local sha> <remote ref> <remote sha>` a line,
 * so the draft check and the gates' skip never read different shas from one
 * input. A deletion's local sha is all zeros; it is kept, flagged, because a
 * deleted tag still bars the skip.
 */
export type PushRef = { sha: string; ref: string; deletion: boolean };

export const pushRefs = (input: string): PushRef[] =>
	input.split("\n").flatMap((line) => {
		const [local, sha, ref] = line.split(" ");
		return local && sha && ref ? [{ sha, ref, deletion: /^0+$/.test(sha) }] : [];
	});
