import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  findDebugIdsWithConflictingSourcemaps,
  findFilesWithForeignSourcemaps,
  findFilesWithMultipleDebugIds,
  findInjectedDebugIds,
  getArtifactBundles,
  getChunkUploadPosts,
  getDebugIdPairs,
  getSourcemapSources,
  getSourcemaps,
  loadMockServerResults,
  startNodeServer,
  type SourcemapEntry,
} from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

/** Both markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';

const DEBUG_ID_PATTERN = /sentry-dbid-([\da-f-]{36})/gi;

function readDebugIds(file: string): string[] {
  return [...fs.readFileSync(file, 'utf8').matchAll(DEBUG_ID_PATTERN)].map(match => (match[1] as string).toLowerCase());
}

function emittedJsFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.m?js$/.test(entry.name) && !entry.parentPath.includes('node_modules'))
    .map(entry => path.join(entry.parentPath, entry.name));
}

/** In debug mode, the Sentry plugin logs each file it deletes after the upload. */
const deletedFiles = new Set(
  [...fs.readFileSync('.tmp_build_stdout', 'utf8').matchAll(/Deleting asset after upload: (.+)$/gm)].map(match =>
    path.relative(fs.realpathSync('.'), match[1] as string),
  ),
);

/** A chunk without mappable source, such as Nitro's runtime, gets a debug ID but no source map to upload. */
function debugIdsOfChunksWithoutSourceMap(dir: string): Set<string> {
  return new Set(
    emittedJsFiles(dir)
      .filter(file => !fs.existsSync(`${file}.map`) && !deletedFiles.has(`${file}.map`))
      .flatMap(readDebugIds),
  );
}

function sourceMapsIn(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.map'))
    .map(entry => path.join(entry.parentPath, entry.name));
}

// TODO: The uploader passes the emitted file paths to `glob` as patterns, so it skips a file whose path has glob
// characters, like Nitro's `_libs/@tanstack/react-router+[...].mjs`. Remove this when the uploader matches paths literally.
function debugIdsOfFilesWithGlobCharacters(dir: string): Set<string> {
  return new Set(
    emittedJsFiles(dir)
      .filter(file => /[[\]{}()*?]/.test(path.relative(dir, file)))
      .flatMap(readDebugIds),
  );
}

const requests = loadMockServerResults();

// --- The upload reached Sentry ---

assert.ok(
  getChunkUploadPosts(requests).some(request => request.bodySize > 0),
  'Expected at least one chunk upload with a non-empty body',
);

const bundles = getArtifactBundles(requests);
assert.ok(bundles.length > 0, 'Expected at least one artifact bundle with a manifest');

const sourcemaps = getSourcemaps(bundles);

/** The uploaded source maps of the files in an output directory, matched by debug ID. */
function sourceMapsOf(outputDir: string): SourcemapEntry[] {
  const debugIds = new Set(findInjectedDebugIds({ outputDir }));
  return sourcemaps.filter(map => map.debugId && debugIds.has(map.debugId));
}

const clientSourceMaps = sourceMapsOf(CLIENT_OUTPUT);
const serverSourceMaps = sourceMapsOf(SERVER_OUTPUT);
const containsMarker = (maps: SourcemapEntry[], marker: string): boolean =>
  maps.some(map => map.sourcemap.sourcesContent?.some(source => source?.includes(marker)));

// Both markers are in the same route file, which client and server source maps embed completely. So each marker only
// proves the upload of its side if the check only looks at the source maps of that side.
assert.ok(containsMarker(clientSourceMaps, CLIENT_MARKER), 'Expected a client source map carrying the client source');
assert.ok(containsMarker(serverSourceMaps, SERVER_MARKER), 'Expected a server source map carrying the server source');

// --- Source paths match the files in the project ---

const unresolvedSources = [...new Set(sourcemaps.flatMap(map => getSourcemapSources(map.sourcemap)))].filter(
  source => source.startsWith('../') || path.isAbsolute(source) || /\?ts[rs]-/.test(source),
);
assert.deepEqual(unresolvedSources, [], 'Expected every uploaded source path to be relative to the project root');

// --- Server source maps reach the original source ---

// Nitro bundles the SSR output again. Its maps must lead through that output to the file the server function is in.
const serverFunctionSources = serverSourceMaps
  .filter(map => map.sourcemap.sourcesContent?.some(source => source?.includes(SERVER_MARKER)))
  .flatMap(map => getSourcemapSources(map.sourcemap));
assert.ok(
  serverFunctionSources.includes('src/routes/index.tsx'),
  `Expected a server source map to resolve to src/routes/index.tsx, got: ${serverFunctionSources.join(', ')}`,
);

// --- Debug IDs tie the shipped bundles to the uploaded maps ---

const uploadedDebugIds = new Set(getDebugIdPairs(bundles).map(pair => pair.debugId.toLowerCase()));

for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
  const injectedDebugIds = findInjectedDebugIds({ outputDir });
  assert.ok(injectedDebugIds.length > 0, `Expected debug IDs to be injected into ${outputDir}`);

  const exemptDebugIds = new Set([
    ...debugIdsOfChunksWithoutSourceMap(outputDir),
    ...debugIdsOfFilesWithGlobCharacters(outputDir),
  ]);
  const unuploaded = injectedDebugIds.filter(debugId => !uploadedDebugIds.has(debugId) && !exemptDebugIds.has(debugId));
  assert.deepEqual(unuploaded, [], `Expected every debug ID in ${outputDir} to have an uploaded source map`);

  // A file of Nitro's output can carry the debug ID of the SSR chunk it was built from.
  assert.deepEqual(
    findFilesWithMultipleDebugIds({ outputDir }),
    [],
    `Expected at most one debug ID per file in ${outputDir}`,
  );
  assert.deepEqual(
    findFilesWithForeignSourcemaps({ outputDir }, sourcemaps),
    [],
    `Expected the source map uploaded for each file in ${outputDir} to be generated for that file`,
  );

  console.log(`  ${outputDir}: ${injectedDebugIds.length} injected debug ID(s)`);
}

assert.deepEqual(
  findDebugIdsWithConflictingSourcemaps(sourcemaps),
  [],
  'Expected every uploaded debug ID to resolve to exactly one source map',
);

// --- Sentry deletes the source maps it enabled after the upload ---

for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
  assert.deepEqual(sourceMapsIn(outputDir), [], `Expected no source maps in ${outputDir}`);
}

const clientChunkUrls = emittedJsFiles(CLIENT_OUTPUT).map(
  file => `/${path.relative(CLIENT_OUTPUT, file).split(path.sep).join('/')}`,
);
assert.ok(clientChunkUrls.length > 0, `Expected client chunks in ${CLIENT_OUTPUT}`);

const server = await startNodeServer({ entry: path.join(SERVER_OUTPUT, 'index.mjs'), port: 3030 });

try {
  // Without this, a server that serves no public files at all would pass the 404 checks.
  const chunkStatus = (await fetch(`${server.baseUrl}${clientChunkUrls[0]}`)).status;
  assert.equal(chunkStatus, 200, `Expected the server to serve the client chunk ${clientChunkUrls[0]}`);

  // Nitro serves public files from a list it writes into the server bundle. A map deleted after that
  // stays on the list, and Nitro answers its request with a 500 instead of a 404.
  const responses = await Promise.all(
    clientChunkUrls.map(async chunkUrl => ({
      mapUrl: `${chunkUrl}.map`,
      status: (await fetch(`${server.baseUrl}${chunkUrl}.map`)).status,
    })),
  );
  assert.deepEqual(
    responses.filter(({ status }) => status !== 404).map(({ mapUrl, status }) => `${mapUrl} → ${status}`),
    [],
    'Expected the server to answer each client source map URL with 404',
  );
} finally {
  await server.close();
}

console.log('All source map assertions passed!');
