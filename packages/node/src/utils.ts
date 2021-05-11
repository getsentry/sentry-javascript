import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively read the contents of a directory.
 *
 * @param targetDir The directory to scan. All returned paths will be relative to this directory.
 * @param _paths Array to hold results, passed for purposes of recursion. Not meant to be provided by the caller.
 * @returns Array holding all relative paths
 */
export function deepReadDirSync(targetDir: string, _paths?: string[]): string[] {
  const paths = _paths || [];
  const currentDirContents = fs.readdirSync(targetDir);

  currentDirContents.forEach((fileOrDirName: string) => {
    const fileOrDirAbsPath = path.join(targetDir, fileOrDirName);

    if (fs.statSync(fileOrDirAbsPath).isDirectory()) {
      deepReadDirSync(fileOrDirAbsPath, paths);
      return;
    }
    paths.push(fileOrDirAbsPath.replace(targetDir, ''));
  });

  return paths;
}
