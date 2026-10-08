import { createHash } from "node:crypto";

export const MAX_ROWS = 250_000;

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Reads an uploaded .xlsx or .csv into a matrix (row 0 = header).
 * Content is sniffed rather than trusting the extension alone.
 */
export async function matrixFromFile(buf: Buffer, fileName: string): Promise<unknown[][]> {
  const lower = fileName.toLowerCase();
  let matrix: unknown[][];
  if (lower.endsWith(".xlsx")) {
    if (!isZip(buf)) throw new ImportFileError("File is not a valid .xlsx workbook");
    const { readSheet, SheetNotFoundError } = await import("read-excel-file/node");
    try {
      matrix = (await readSheet(buf, "AthleteMaster")) as unknown[][];
    } catch (e) {
      if (!(e instanceof SheetNotFoundError)) throw wrap(e);
      try {
        matrix = (await readSheet(buf)) as unknown[][]; // first sheet
      } catch (e2) {
        throw wrap(e2);
      }
    }
  } else if (lower.endsWith(".csv")) {
    if (isZip(buf)) throw new ImportFileError("File has a .csv extension but looks like a workbook");
    const { parse } = await import("csv-parse/sync");
    try {
      matrix = parse(buf, { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][];
    } catch (e) {
      throw wrap(e);
    }
  } else {
    throw new ImportFileError("Unsupported file type – upload a .xlsx or .csv file");
  }
  if (matrix.length - 1 > MAX_ROWS) throw new ImportFileError(`File has more than ${MAX_ROWS.toLocaleString("en-IN")} rows`);
  return matrix;
}

function wrap(e: unknown): ImportFileError {
  if (e instanceof ImportFileError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new ImportFileError(`Could not read the file: ${msg}`);
}
