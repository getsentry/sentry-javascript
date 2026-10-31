import * as path from 'node:path';
import { assertSourceMapUpload } from '@sentry-internal/test-utils';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';

const BUILD_OUTPUT = 'dist';
const OUTPUT_DIRS = isStatic ? [BUILD_OUTPUT] : [path.join(BUILD_OUTPUT, 'client'), path.join(BUILD_OUTPUT, 'server')];

assertSourceMapUpload({
  outputDirs: OUTPUT_DIRS,
  // The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
  strippedDirs: [BUILD_OUTPUT],
  markers: {
    'client source': 'SOURCEMAP_MARKER_CLIENT',
    ...(isStatic ? {} : { 'server source': 'SOURCEMAP_MARKER_SERVER' }),
    // Astro 7 writes the prerender build to a hidden `.prerender` folder, which a plain `dist/**/*` glob skips
    'prerendered page source': 'SOURCEMAP_MARKER_PRERENDER',
  },
  // Written by the build, see `recordChunksWithoutSourceMap` in `astro.config.mjs`.
  debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
});

console.log('All sourcemap assertions passed!');
