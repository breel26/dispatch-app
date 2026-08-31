// Crafts (trades) and classifications, and how they are written for people
// to read.
//
// The stored values are enum constants, but a dispatcher must never see
// PIPE_FITTER on a screen. Labels live here rather than being re-derived at
// each render, so the spelling is decided once - "Pipe Fitter", not
// "Pipefitter" or "Pipe fitter".
//
// This module is the single source for both halves: the Zod schemas build
// their `z.enum` from these tuples, and the dropdowns render from them. A
// trade cannot end up selectable in the UI but rejected by validation,
// because both read the same list.

// Ordered as dispatchers list the trades, not alphabetically. The dropdown
// preserves this order deliberately - alphabetical would bury the common
// trades among the rare ones.
export const CRAFT_VALUES = [
  "CARPENTER",
  "LABORER",
  "IRONWORKER",
  "OPERATOR",
  "ELECTRICIAN",
  "PIPE_FITTER",
  "PLUMBER",
  "MASON",
  "PILE_DRIVER",
  "TEAMSTER",
] as const;

export type Craft = (typeof CRAFT_VALUES)[number];

export const CLASSIFICATION_VALUES = ["JOURNEYMAN", "APPRENTICE"] as const;

export type Classification = (typeof CLASSIFICATION_VALUES)[number];

// Typed as a total Record on purpose: adding an eleventh trade to
// CRAFT_VALUES without giving it a label is a compile error, not a screen
// showing a raw enum constant.
const CRAFT_LABELS: Record<Craft, string> = {
  CARPENTER: "Carpenter",
  LABORER: "Laborer",
  IRONWORKER: "Ironworker",
  OPERATOR: "Operator",
  ELECTRICIAN: "Electrician",
  PIPE_FITTER: "Pipe Fitter",
  PLUMBER: "Plumber",
  MASON: "Mason",
  PILE_DRIVER: "Pile Driver",
  TEAMSTER: "Teamster",
};

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  JOURNEYMAN: "Journeyman",
  APPRENTICE: "Apprentice",
};

// Narrowing guards for the FormData boundary, where everything arrives as
// an untyped string. Used by the Server Actions so an unrecognised value is
// refused with a readable message rather than cast and hoped for.
export function isCraft(value: string): value is Craft {
  return (CRAFT_VALUES as readonly string[]).includes(value);
}

export function isClassification(value: string): value is Classification {
  return (CLASSIFICATION_VALUES as readonly string[]).includes(value);
}

export function craftLabel(craft: Craft): string {
  return CRAFT_LABELS[craft];
}

export function classificationLabel(classification: Classification): string {
  return CLASSIFICATION_LABELS[classification];
}

// Convenience for the places that show a worker's trade and grade together
// - the personnel list, the detail header, the crew picker on a job.
export function describeCraft(craft: Craft, classification: Classification): string {
  return `${craftLabel(craft)}, ${classificationLabel(classification)}`;
}

// Ready-made {value,label} pairs for a <select>, in the canonical order.
export const CRAFT_OPTIONS = CRAFT_VALUES.map((value) => ({
  value,
  label: CRAFT_LABELS[value],
}));

export const CLASSIFICATION_OPTIONS = CLASSIFICATION_VALUES.map((value) => ({
  value,
  label: CLASSIFICATION_LABELS[value],
}));
