import { NotAuthenticatedError } from "@/modules/shared/authContext";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Wraps a generated xlsx as a download.
 *
 * The three export routes are GET Route Handlers rather than Server
 * Actions, which is not a crack in the "one write path" rule from
 * CLAUDE.md: that rule is about writes, and these only read. A download
 * has to answer with a real Response carrying Content-Disposition, and a
 * Server Action can only return serializable data - routing a file through
 * one would mean base64 in the RSC payload and a Blob dance in the
 * browser, for a worse result.
 *
 * The date in the filename means exporting twice in a day does not
 * silently overwrite the first file in the browser's downloads folder.
 */
export function xlsxDownload(buffer: Buffer, basename: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${basename}-${stamp}.xlsx"`,
      // A roster or fleet list is not something to leave in a shared cache.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Middleware already turns away signed-out requests, so this is a backstop
 * for a direct call - the same role the throw in requireAuthContext plays.
 * Answering 401 rather than letting the error escape keeps a stray request
 * from surfacing as a 500 in the logs.
 */
export function unauthorizedIfSignedOut(err: unknown): Response {
  if (err instanceof NotAuthenticatedError) {
    return new Response("Not signed in", { status: 401 });
  }
  throw err;
}
