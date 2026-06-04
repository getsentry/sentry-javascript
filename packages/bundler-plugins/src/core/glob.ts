import { glob } from "glob";

export function globFiles(
  patterns: string | string[],
  options?: { root?: string; ignore?: string | string[] }
): Promise<string[]> {
  return glob(patterns, { absolute: true, nodir: true, ...options });
}
