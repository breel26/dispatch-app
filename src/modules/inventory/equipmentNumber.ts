// Equipment numbers: XX-XX-XXXX, dispatcher-assigned (like Personnel's
// employeeId, not system-generated like PO numbers - a piece of equipment
// usually already has a fleet number painted on it or printed on a rental
// tag, and this scheme is meant to be able to match that).
//
//   XX-__-____   type: what kind of machine this is
//   __-XX-____   capacity: its weight or lifting-capacity class
//   __-__-XXXX   sequence: unique among equipment of that same type+class
//
// TYPE CODES
// Buck specified 01/02/03 and asked for the remaining major construction
// equipment categories built out from there. The list below is a
// reasonable starting taxonomy, not a closed authority - unlike Craft
// (a fixed Prisma enum), these are a plain validated list in this module
// specifically so a new category is a one-line addition here, never a
// migration. Confirm this list covers the fleet before relying on it.
export const EQUIPMENT_TYPE_CODES = {
  "00": "Unclassified",
  "01": "Cars & Trucks",
  "02": "Small Equipment (forklifts, skid-steers, earth rammers)",
  "03": "Excavators",
  "04": "Loaders (wheel & track)",
  "05": "Bulldozers",
  "06": "Motor Graders",
  "07": "Backhoe Loaders",
  "08": "Cranes",
  "09": "Compactors & Rollers",
  "10": "Dump & Haul Trucks",
  "11": "Concrete Equipment (pumps, mixers)",
  "12": "Aerial & Lift Equipment (boom lifts, scissor lifts)",
  "13": "Pile Driving Equipment",
  "14": "Generators, Compressors & Light Towers",
  "15": "Trailers & Attachments",
  "16": "Paving Equipment (asphalt pavers, milling machines)",
} as const;

export type EquipmentTypeCode = keyof typeof EQUIPMENT_TYPE_CODES;

// CAPACITY CODES
// Buck said the code should mean a ton range or a lifting capacity in
// thousands of pounds, without giving exact bracket boundaries - these
// numbers are a reasonable starting scale covering everything from a
// pickup truck to heavy cranes, ascending and non-overlapping, but they
// are a first draft. Adjust the boundaries here; nothing else in the
// codebase encodes what a given code means. "00" is reserved the same
// way as the type table, for equipment nobody has classified yet.
export const EQUIPMENT_CAPACITY_CODES = {
  "00": "Unspecified",
  "01": "Up to 2,000 lb (1 ton)",
  "02": "2,001-5,000 lb (1-2.5 tons)",
  "03": "5,001-10,000 lb (2.5-5 tons)",
  "04": "10,001-15,000 lb (5-7.5 tons)",
  "05": "15,001-20,000 lb (7.5-10 tons)",
  "06": "20,001-30,000 lb (10-15 tons)",
  "07": "30,001-40,000 lb (15-20 tons)",
  "08": "40,001-50,000 lb (20-25 tons)",
  "09": "50,001-75,000 lb (25-37.5 tons)",
  "10": "75,001-100,000 lb (37.5-50 tons)",
  "11": "100,001-150,000 lb (50-75 tons)",
  "12": "Over 150,000 lb (75+ tons)",
} as const;

export type EquipmentCapacityCode = keyof typeof EQUIPMENT_CAPACITY_CODES;

export const EQUIPMENT_TYPE_OPTIONS = Object.entries(EQUIPMENT_TYPE_CODES).map(
  ([value, label]) => ({ value: value as EquipmentTypeCode, label: `${value} - ${label}` })
);

export const EQUIPMENT_CAPACITY_OPTIONS = Object.entries(EQUIPMENT_CAPACITY_CODES).map(
  ([value, label]) => ({ value: value as EquipmentCapacityCode, label: `${value} - ${label}` })
);

export function isEquipmentTypeCode(value: string): value is EquipmentTypeCode {
  return value in EQUIPMENT_TYPE_CODES;
}

export function isEquipmentCapacityCode(value: string): value is EquipmentCapacityCode {
  return value in EQUIPMENT_CAPACITY_CODES;
}

const SEQUENCE_LENGTH = 4;
const EQUIPMENT_NUMBER_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;

export interface EquipmentNumberParts {
  type: EquipmentTypeCode;
  capacity: EquipmentCapacityCode;
  sequence: string; // kept as a zero-padded string, like a house number
}

export function formatEquipmentNumber(parts: EquipmentNumberParts): string {
  return `${parts.type}-${parts.capacity}-${parts.sequence.padStart(SEQUENCE_LENGTH, "0")}`;
}

// Parses an already-canonical equipment number back into its parts.
// Returns null (rather than throwing) for anything that does not match
// XX-XX-XXXX or names an unregistered type/capacity code, so callers can
// tell "not shaped like an equipment number" apart from "not one we have
// on file".
export function parseEquipmentNumber(value: string): EquipmentNumberParts | null {
  const match = value.match(EQUIPMENT_NUMBER_PATTERN);
  if (!match) return null;

  const [, type, capacity, sequence] = match;
  if (!isEquipmentTypeCode(type) || !isEquipmentCapacityCode(capacity)) return null;

  return { type, capacity, sequence };
}

// Normalizes what a dispatcher might type - tolerating missing dashes or
// extra whitespace - into the canonical XX-XX-XXXX form, the same
// forgiving-input/canonical-output split used by normalizePoNumberInput
// and normalizeEmployeeIdInput. Returns null for anything that is not
// eight digits naming a registered type and capacity.
export function normalizeEquipmentNumberInput(raw: string): string | null {
  const digitsOnly = raw.trim().replace(/[\s-]/g, "");
  if (!/^\d{8}$/.test(digitsOnly)) return null;

  const type = digitsOnly.slice(0, 2);
  const capacity = digitsOnly.slice(2, 4);
  const sequence = digitsOnly.slice(4, 8);

  if (!isEquipmentTypeCode(type) || !isEquipmentCapacityCode(capacity)) return null;

  return formatEquipmentNumber({ type, capacity, sequence });
}

// The sequence is four digits, so a type+capacity family holds at most
// 9999 machines. Reaching that is not realistic for a real fleet, but the
// suggestion logic still has to say "no number left" rather than roll over
// to 0000 or silently widen the format.
export const EQUIPMENT_SEQUENCE_MAX = 9999;

// Suggests the next number in one type+capacity family: the highest
// sequence in use, plus one.
//
// Gaps are deliberately NOT filled. If 0001-0003 and 0007 are in use the
// suggestion is 0008, not 0004. A fleet number outlives the machine that
// carried it - it is on old purchase orders, delivery tickets and job
// paperwork - so handing a scrapped excavator's number to a new loader
// makes that history ambiguous in a way nobody can untangle later.
//
// `existingNumbers` is anything iterable so callers can pass the numbers
// already on file, plus the ones claimed earlier in the same import batch,
// without building an intermediate array. Values that are not canonical
// equipment numbers are skipped rather than throwing: this answers "what
// number is free", and a malformed row is a separate problem reported
// separately.
//
// Returns null when the family is exhausted.
export function nextEquipmentNumber(
  existingNumbers: Iterable<string>,
  type: EquipmentTypeCode,
  capacity: EquipmentCapacityCode
): string | null {
  let highest = 0;

  for (const value of existingNumbers) {
    const parts = parseEquipmentNumber(value);
    if (!parts) continue;
    // Sequences are only unique within a type+capacity pair, so numbers
    // from other families say nothing about what is free in this one.
    if (parts.type !== type || parts.capacity !== capacity) continue;

    // Safe as a Number here, unlike employee ids: the regex already
    // guarantees exactly four digits, so the value cannot exceed 9999.
    const sequence = Number(parts.sequence);
    if (sequence > highest) highest = sequence;
  }

  const next = highest + 1;
  if (next > EQUIPMENT_SEQUENCE_MAX) return null;

  return formatEquipmentNumber({ type, capacity, sequence: String(next) });
}
