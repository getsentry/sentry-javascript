import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertSourceMapUpload,
  findDebugIdsInFilesWithGlobCharacters,
  findSourceMapFiles,
  findSourceMappingUrlComments,
} from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and asks the bundler plugin to
// remove them from the client output, also when no upload runs. `@sentry/nitro` handles the server output.
if (process.env.E2E_NO_UPLOAD) {
  assert.deepEqual(findSourceMapFiles({ outputDir: CLIENT_OUTPUT }), [], `Expected no source maps in ${CLIENT_OUTPUT}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }),
    [],
    `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`,
  );
} else {
  assertSourceMapUpload({
    outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
    markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
    debugIdsWithoutSourceMap: [
      // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.ts`.
      ...(fs.existsSync('.tmp_debug_ids_without_source_map')
        ? fs.readFileSync('.tmp_debug_ids_without_source_map', 'utf8').split('\n').filter(Boolean)
        : []),
      ...findDebugIdsInFilesWithGlobCharacters({ outputDir: SERVER_OUTPUT }),
    ],
  });
}

console.log('All sourcemap assertions passed!');
