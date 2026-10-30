/* oxlint-disable no-console -- the log is the context for a failed assertion */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { findInjectedDebugIds, findSourceMapFiles, findSourceMappingUrlComments } from './build-output';
import type { ArtifactBundleData, RequestRecord, SourcemapEntry } from './sourcemap-upload-utils';
import {
  getArtifactBundles,
  getAssembleRequests,
  getChunkUploadPosts,
  getDebugIdPairs,
  getSourcemaps,
  loadMockServerResults,
} from './sourcemap-upload-utils';

export interface SourceMapUploadAssertionOptions {
  /** Directories with emitted JavaScript. Every debug ID injected there must have an uploaded source map. */
  outputDirs: string[];
  /** Directories that must hold no `.map` file and no `sourceMappingURL` comment. Defaults to `outputDirs`. */
  strippedDirs?: string[];
  /**
   * Strings that an uploaded source map must carry in its `sourcesContent`, keyed by what they prove, for example
   * `{ 'client source': 'SOURCEMAP_MARKER_CLIENT' }`. Put the marker in a comment, so the bundler strips it from
   * the code but keeps it in the map.
   */
  markers: Record<string, string>;
  /** Defaults to `fake-auth-token`. */
  authToken?: string;
  /** Defaults to `test-project`. */
  project?: string;
  /** Defaults to `test-release`. */
  release?: string;
  /**
   * Debug IDs of chunks without a source map, for which no upload is expected. Either the IDs themselves or a
   * file with one ID per line. Defaults to `.tmp_debug_ids_without_source_map`, which a build plugin writes
   * while the maps still exist, before the upload deletes them. A missing file means no exemptions.
   */
  debugIdsWithoutSourceMap?: Iterable<string> | string;
  /** Build logs that must not carry the uploader's "no matching sources" warning. Missing files are skipped. */
  buildLogFiles?: string[];
  /** Defaults to the requests the mock Sentry server recorded. */
  requests?: RequestRecord[];
}

export interface SourceMapUploadAssertionResult {
  requests: RequestRecord[];
  bundles: ArtifactBundleData[];
  sourcemaps: SourcemapEntry[];
  /** Lowercased debug IDs that have an uploaded JS and source map pair. */
  uploadedDebugIds: Set<string>;
}

function readDebugIdList(source: Iterable<string> | string | undefined): Set<string> {
  if (source !== undefined && typeof source !== 'string') {
    return new Set([...source].map(debugId => debugId.toLowerCase()));
  }

  const file = source ?? '.tmp_debug_ids_without_source_map';
  if (!fs.existsSync(file)) {
    return new Set();
  }

  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(debugId => debugId.toLowerCase()),
  );
}

/**
 * Asserts that a build uploaded its source maps to the mock Sentry server and stripped them from its output.
 *
 * This is the contract every framework SDK keeps when it manages source maps for the user: the maps reach
 * Sentry with the debug IDs the shipped bundles carry, the shipped bundles reference no map, and no map
 * is left where it would be served.
 *
 * Returns what it read, so an app can add assertions of its own on top.
 */
export function assertSourceMapUpload(options: SourceMapUploadAssertionOptions): SourceMapUploadAssertionResult {
  const {
    outputDirs,
    strippedDirs = outputDirs,
    markers,
    authToken = 'fake-auth-token',
    project = 'test-project',
    release = 'test-release',
    buildLogFiles = ['.tmp_build_stdout', '.tmp_build_stderr'],
  } = options;

  const requests = options.requests ?? loadMockServerResults();

  console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
  for (const request of requests) {
    console.log(`  ${request.method} ${request.url} (${request.bodySize} bytes)`);
  }
  console.log('');

  // --- The upload reached Sentry ---

  assert.ok(
    requests.some(r => r.authorization.includes(authToken)),
    'Expected requests with the configured auth token',
  );

  assert.ok(
    getChunkUploadPosts(requests).some(r => r.bodySize > 0),
    'Expected at least one chunk upload POST with a non-empty body',
  );

  const assembleRequests = getAssembleRequests(requests);
  assert.ok(assembleRequests.length > 0, 'Expected at least one assemble request');
  for (const request of assembleRequests) {
    assert.ok(request.assembleBody?.projects?.includes(project), `Expected assemble request for ${project}`);
    assert.equal(request.assembleBody?.version, release, 'Expected assemble request to reference the release');
  }

  const bundles = getArtifactBundles(requests);
  assert.ok(bundles.length > 0, 'Expected at least one artifact bundle with a manifest');

  // --- The uploaded maps carry the app's source ---

  const sourcemaps = getSourcemaps(bundles);
  assert.ok(
    sourcemaps.some(map => map.sourcemap.mappings?.length),
    'Expected at least one uploaded source map with non-empty mappings',
  );

  for (const [proves, marker] of Object.entries(markers)) {
    assert.ok(
      sourcemaps.some(map => map.sourcemap.sourcesContent?.some(source => source?.includes(marker))),
      `Expected an uploaded source map carrying the ${proves} (marker ${marker})`,
    );
  }

  const buildOutput = buildLogFiles
    .filter(file => fs.existsSync(file))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');
  assert.ok(
    !buildOutput.includes("Didn't find any matching sources for debug ID upload"),
    'Expected every build to find sources for the debug ID upload',
  );

  // --- Debug IDs tie the shipped bundles to the uploaded maps ---

  const uploadedDebugIds = new Set(getDebugIdPairs(bundles).map(pair => pair.debugId.toLowerCase()));
  assert.ok(uploadedDebugIds.size > 0, 'Expected at least one JS/source map pair with matching debug IDs');

  const exemptDebugIds = readDebugIdList(options.debugIdsWithoutSourceMap);

  for (const outputDir of outputDirs) {
    const injectedDebugIds = findInjectedDebugIds({ outputDir });
    assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);
    // The exemption for chunks without a source map must not let a build without any uploaded map pass.
    assert.ok(
      injectedDebugIds.some(debugId => uploadedDebugIds.has(debugId)),
      `Expected at least one debug ID in ${outputDir} to have an uploaded source map`,
    );

    const unuploaded = injectedDebugIds.filter(
      debugId => !uploadedDebugIds.has(debugId) && !exemptDebugIds.has(debugId),
    );
    assert.deepEqual(unuploaded, [], `Expected every debug ID in ${outputDir} to have an uploaded source map`);

    console.log(`  ${outputDir}: ${injectedDebugIds.length} injected debug ID(s), all uploaded`);
  }

  // --- Nothing is left where it would be served ---

  for (const strippedDir of strippedDirs) {
    // A surviving map hands out the original source to anyone who requests it.
    assert.deepEqual(findSourceMapFiles({ outputDir: strippedDir }), [], `Expected no source maps in ${strippedDir}`);
    // The maps are gone, so a surviving reference only 404s in devtools and leaks where they were.
    assert.deepEqual(
      findSourceMappingUrlComments({ outputDir: strippedDir }),
      [],
      `Expected no sourceMappingURL comments in ${strippedDir}`,
    );

    console.log(`  ${strippedDir}: free of source maps and sourceMappingURL comments`);
  }
  console.log('');

  return { requests, bundles, sourcemaps, uploadedDebugIds };
}
