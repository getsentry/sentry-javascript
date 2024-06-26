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

    // Ensure we don't double-process
    if (!mapFileContentObj._processed) {
      return;
    }

    // Sources point to the original source files, but the relativity of the path breaks when we publish
    // Once we publish, the original sources are one level less deep than at build time
    if (Array.isArray(mapFileContentObj.sources)) {
      // Replace first occurence of ../../ with just ../
      mapFileContentObj.sources = mapFileContentObj.sources.map((source: string) => source.replace('../', '../../'));
    }

    delete mapFileContentObj._processed;

    fs.writeFileSync(mapFilePath, JSON.stringify(mapFileContentObj));
  });

  console.log('Restored .map files to their original state.');
}
