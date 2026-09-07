// The row-numbering convention shared by every importer.
//
// Row numbers used to be implicit - an index into whichever array was to
// hand - which was fine while they only appeared in error messages nobody
// cross-referenced. Clash resolution changed that: the review screen keys
// a dispatcher's decisions by row number, so "row 7" there and "row 7" in
// the committed result have to mean the same line of the same spreadsheet,
// even when rows 3 and 5 failed validation and dropped out in between.
// Carrying the number explicitly from the sheet is the only way that
// holds.

/** A row as parsed out of a file, before validation. */
export interface RawRow {
  /**
   * 1-based against data rows, header excluded - so row 1 is the first
   * row under the header, which is what a dispatcher counts.
   *
   * Taken from the sheet itself rather than from a running counter,
   * because ExcelJS skips entirely empty rows: a blank line in the middle
   * of a file would otherwise shift every number below it.
   */
  row: number;
  raw: unknown;
}

/** A row that passed validation, still carrying where it came from. */
export interface ValidRow<TRow> {
  row: number;
  data: TRow;
}

/** What every row validator returns. */
export interface RowValidationResult<TRow> {
  valid: ValidRow<TRow>[];
  errors: { row: number; message: string }[];
}
