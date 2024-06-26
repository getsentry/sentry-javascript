/* eslint-disable no-console */
/*
  This script restores the build folder to a workable state after packaging.
*/

import * as fs from 'fs';
import * as path from 'path';
import { sync as glob } from 'glob';

const NPM_BUILD_DIR = 'build/npm';
const BUILD_DIR = 'build';

const packageWithBundles = process.argv.includes('--bundles');
const buildDir = packageWithBundles ? NPM_BUILD_DIR : BUILD_DIR;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkgJson = require(path.resolve('package.json')) as Record<string, string>;

// check if build dir exists
if (!fs.existsSync(path.resolve(buildDir))) {
  console.error(`\nERROR: Directory '${buildDir}' does not exist in ${pkgJson.name}.`);
  console.error("This script should only be executed after you've run `yarn build`.");
  process.exit(1);
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
}

restoreSourceMapSourcesPath(buildDir);
