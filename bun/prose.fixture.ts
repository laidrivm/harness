/** `text` with every run of whitespace one space, so a pin on prose matches across a line wrap (`core/rules.md`, *Compare prose across a line wrap*). */
export const flat = (text: string) => text.replace(/\s+/g, " ");
