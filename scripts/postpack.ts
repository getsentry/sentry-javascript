/* eslint-disable no-console */

/*
  This script restores the build folder to a workable state after packaging.
*/

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sync as glob } from 'glob';

export async function postpack(buildDir: string): Promise<void> {
  restoreSourceMapSourcesPath(buildDir);
}

function restoreSourceMapSourcesPath(buildDir: string): void {
  const mapFiles = glob('**/*.map', { cwd: buildDir });

  mapFiles.forEach(mapFile => {
    const mapFilePath = path.resolve(buildDir, mapFile);
    const mapFileContent = fs.readFileSync(mapFilePath, 'utf8');
    const mapFileContentObj = JSON.parse(mapFileContent) as { sources?: string[]; _processed?: boolean };

    // Ensure we don't revert unprocessed files
    if (!mapFileContentObj._processed) {
      return;
    }

    // Restore sources in .map files back to their original value
    // Otherwise, the references are incorrect for local development
    if (Array.isArray(mapFileContentObj.sources)) {
      // Replace first occurence of ../../ with just ../
      mapFileContentObj.sources = mapFileContentObj.sources.map((source: string) => source.replace('../', '../../'));
    }

    delete mapFileContentObj._processed;

    fs.writeFileSync(mapFilePath, JSON.stringify(mapFileContentObj));
  });

  console.log('Restored .map files to their original state.');
}
