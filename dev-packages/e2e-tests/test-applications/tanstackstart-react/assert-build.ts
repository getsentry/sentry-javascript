import * as path from 'node:path';
import { assertSourceMapUpload } from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
// The SDK enables them for the client build only: the server build in `.output/server` ships debug IDs but
// no source maps, so nothing of it reaches Sentry. Cover the server here once the SDK uploads its maps.
assertSourceMapUpload({
  outputDirs: [CLIENT_OUTPUT],
  markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT' },
  // Written by the build, see `recordChunksWithoutSourceMap` in `vite.config.ts`.
  debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
});

console.log('All sourcemap assertions passed!');
