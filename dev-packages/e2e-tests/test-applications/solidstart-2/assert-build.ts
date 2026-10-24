import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertSourceMapUpload, findDebugIdsInFilesWithGlobCharacters } from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
// TODO: The client maps stay in `.output/public`, because the SDK's deletion glob `./**/*.map` skips dot
// folders. Add `CLIENT_OUTPUT` to `strippedDirs` once the SDK deletes them.
assertSourceMapUpload({
  outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
  strippedDirs: [SERVER_OUTPUT],
  markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
  debugIdsWithoutSourceMap: [
    // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.ts`.
    ...(fs.existsSync('.tmp_debug_ids_without_source_map')
      ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
      : []),
    ...findDebugIdsInFilesWithGlobCharacters({ outputDir: SERVER_OUTPUT }),
  ],
});

console.log('All sourcemap assertions passed!');
