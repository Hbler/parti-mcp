import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED_OUTPUT_DIR = path.resolve(PROJECT_ROOT, "output");

/**
 * Validate and resolve a caller-supplied outputPath against the allowed output
 * directory. Rejects `..` traversal and anything that resolves outside
 * ALLOWED_OUTPUT_DIR, including sibling directories that merely share its
 * string prefix (e.g. "output-evil" must not pass a check against "output").
 */
export function validateOutputPath(inputPath: string): string | null {
  if (inputPath.includes("..")) {
    return null;
  }

  const resolved = path.resolve(PROJECT_ROOT, inputPath);

  if (resolved !== ALLOWED_OUTPUT_DIR && !resolved.startsWith(ALLOWED_OUTPUT_DIR + path.sep)) {
    return null;
  }

  return resolved;
}
