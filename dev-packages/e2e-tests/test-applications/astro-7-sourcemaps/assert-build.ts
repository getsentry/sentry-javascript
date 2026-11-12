import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertSourceMapUpload,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
} from '@sentry-internal/test-utils';

const isStatic = process.env.E2E_ASTRO_OUTPUT === 'static';
const noUpload = !!process.env.E2E_NO_UPLOAD;

const BUILD_OUTPUT = noUpload ? 'build' : 'dist';
const OUTPUT_DIRS = isStatic ? [BUILD_OUTPUT] : [path.join(BUILD_OUTPUT, 'client'), path.join(BUILD_OUTPUT, 'server')];

// The SDK enables hidden source maps when the app sets none, and asks the bundler plugin to remove
// them from the client, server and prerender output, also when no upload runs.
if (noUpload) {
  // Written by the build, see `recordSourceMaps` in `astro.config.mjs`.
  const mapsMade = new Map<string, number>();
  for (const line of fs.readFileSync('.tmp_source_maps_made', 'utf8').split('\n').filter(Boolean)) {
    const [environment, count] = line.split(' ');
    mapsMade.set(environment as string, (mapsMade.get(environment as string) ?? 0) + Number(count));
  }
  for (const environment of ['client', 'ssr', 'prerender']) {
    assert.ok(mapsMade.get(environment), `Expected the ${environment} build to make source maps`);
  }
  assert.notDeepEqual(findInjectedDebugIds({ outputDir: BUILD_OUTPUT }), [], `Expected debug IDs in ${BUILD_OUTPUT}`);

  assert.deepEqual(findSourceMapFiles({ outputDir: BUILD_OUTPUT }), [], `Expected no source maps in ${BUILD_OUTPUT}`);
  assert.deepEqual(
    findSourceMappingUrlComments({ outputDir: BUILD_OUTPUT }),
    [],
    `Expected no sourceMappingURL comments in ${BUILD_OUTPUT}`,
  );
} else {
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
}

console.log('All sourcemap assertions passed!');
