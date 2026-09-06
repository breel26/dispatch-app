// Pure narrowing logic behind the equipment picker in AssignmentForm.
// Kept separate from the component so the actual narrowing behavior -
// typing a fleet number narrows owners/types/units together, browsing by
// owner then type narrows units - can be unit tested without rendering
// anything.

export interface EquipmentUnitOption {
  id: string;
  number: string; // fleet number, e.g. "03-04-0002"
  owner: string; // "Company Owned" or a rental vendor name
  type: string;
}

// Substring match on the fleet number, case-insensitive so a dispatcher
// typing lowercase still matches. Empty query matches everything.
export function filterByNumber(
  units: EquipmentUnitOption[],
  numberQuery: string
): EquipmentUnitOption[] {
  const q = numberQuery.trim().toLowerCase();
  if (!q) return units;
  return units.filter((u) => u.number.toLowerCase().includes(q));
}

export function ownersFor(units: EquipmentUnitOption[]): string[] {
  return Array.from(new Set(units.map((u) => u.owner))).sort();
}

export function typesFor(units: EquipmentUnitOption[], owner: string): string[] {
  return Array.from(
    new Set(units.filter((u) => u.owner === owner).map((u) => u.type))
  ).sort();
}

export function unitsFor(
  units: EquipmentUnitOption[],
  owner: string,
  type: string
): EquipmentUnitOption[] {
  return units.filter((u) => u.owner === owner && u.type === type);
}

// Number first, since the fleet number is what a dispatcher searches by.
export function equipmentOptionLabel(unit: EquipmentUnitOption): string {
  return `${unit.number} — ${unit.owner} — ${unit.type}`;
}
