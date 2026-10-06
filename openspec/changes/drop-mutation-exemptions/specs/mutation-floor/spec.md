## REMOVED Requirements

### Requirement: An equivalent mutant is admitted at the line it occupies

**Reason**: The requirement asked this repository to re-check the spelling of a
Stryker directive — rejecting `all`, a block-comment spelling, a missing
`next-line`, and a directive with no reason. `src/model.ts` has never carried
a directive of any spelling, and the failure the checks exist to prevent is
already caught by the requirement above them: the floor is an exact-match
comparison in both directions, so a malformed directive leaves the survivor
count where it was and the attempt to record its gain by lowering the floor
fails, naming both numbers. Measured against `gauge` directly — malformed and
lowered fails, well-formed and lowered passes, and a directive written with
the floor left alone passes because nothing was claimed.

**Migration**: None for a caller; the gate's inputs and outputs are unchanged.
An author may still admit an equivalent mutant exactly as before — the comment
is Stryker's own feature and Stryker still honours it — and the floor is still
lowered on a line carrying its reason, which the requirement *The count of
surviving mutants may not rise silently* continues to demand. What goes is the
second reading of that comment by this repository. An author who mistypes one
learns of it when the lowered floor is refused rather than at the line itself.
