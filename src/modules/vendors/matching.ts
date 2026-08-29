export interface VendorLike {
  id: string;
  name: string;
  categories: string[];
}

// Case-insensitive category match. Used both by the repository's
// findVendorsByCategory (DB-backed) and directly in tests, so the
// matching rule only needs to be right in one place.
export function vendorMatchesCategory(
  vendor: VendorLike,
  category: string
): boolean {
  const target = category.trim().toLowerCase();
  return vendor.categories.some((c) => c.trim().toLowerCase() === target);
}

export function filterVendorsByCategory<T extends VendorLike>(
  vendors: T[],
  category: string
): T[] {
  return vendors.filter((v) => vendorMatchesCategory(v, category));
}
