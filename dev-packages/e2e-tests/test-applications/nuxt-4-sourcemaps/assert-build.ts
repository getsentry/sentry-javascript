import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertSourceMapUpload,
  findDebugIdsWithConflictingSourcemaps,
  findFilesWithForeignSourcemaps,
  findFilesWithMultipleDebugIds,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getAssembleRequests,
  getSourcemapSources,
  startNodeServer,
} from '@sentry-internal/test-utils';

/** This variant omits `sourcemaps.filesToDeleteAfterUpload`, so Sentry must upload but not delete. */
const keepClientSourceMaps = process.env.E2E_KEEP_CLIENT_SOURCEMAPS === 'true';

/** `nuxt generate` emits no `.output/server`. Keyed on the command so a missing one under `nuxt build` still fails. */
const isStaticBuild = process.env.NUXT_COMMAND === 'generate';

const nitroPreset = process.env.NITRO_PRESET ?? 'node-server';

/** If Nitro moves one of these directories, the debug ID checks below fail. */
const OUTPUT_DIRS: Record<string, { client: string; server: string }> = {
  'node-server': { client: path.join('.output', 'public'), server: path.join('.output', 'server') },
  netlify: { client: 'dist', server: path.join('.netlify', 'functions-internal', 'server') },
  'cloudflare-pages': { client: 'dist', server: path.join('dist', '_worker.js') },
};

const outputDirs = OUTPUT_DIRS[nitroPreset];
assert.ok(outputDirs, `Expected output directories for the Nitro preset ${nitroPreset}`);

const CLIENT_OUTPUT = outputDirs.client;
/** Vite's own output directory. Nitro copies it to `CLIENT_OUTPUT`, and Sentry deletes no maps here. */
const CLIENT_BUILD_OUTPUT = path.join('.nuxt', 'dist', 'client');
const SERVER_OUTPUT = outputDirs.server;

/** Both markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';

const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Some presets write the server into the client output, e.g. Cloudflare Pages. */
function isClientFile(file: string): boolean {
  const relativePath = path.relative(SERVER_OUTPUT, file);
  return relativePath.startsWith('..') || path.isAbsolute(relativePath);
}

function filesContaining(dir: string, needle: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => fs.readFileSync(file, 'utf8').includes(needle));
}

/**
 * Rolldown emits no source map for a chunk without mappable source, such as Vue's export helper.
 * Such a chunk still gets a debug ID, but there is no map to upload for it.
 */
function debugIdsOfChunksWithoutSourceMap(dir: string): Set<string> {
  const debugIds = new Set<string>();

  for (const file of filesContaining(dir, 'sentry-dbid-')) {
    if (file.endsWith('.map') || fs.existsSync(`${file}.map`)) {
      continue;
    }

    for (const match of fs.readFileSync(file, 'utf8').matchAll(/sentry-dbid-([\da-f-]{36})/gi)) {
      debugIds.add((match[1] as string).toLowerCase());
    }
  }

  return debugIds;
}

console.log(
  `Variant: ${isStaticBuild ? 'nuxt generate' : 'nuxt build'}, Nitro preset ${nitroPreset}, ` +
    `client source maps ${keepClientSourceMaps ? 'kept' : 'deleted'}\n`,
);

const { requests, bundles, sourcemaps, uploadedDebugIds } = assertSourceMapUpload({
  outputDirs: isStaticBuild ? [CLIENT_OUTPUT] : [CLIENT_OUTPUT, SERVER_OUTPUT],
  // The client output is checked below, because the "kept" variant expects its maps to stay and some presets
  // write the server into it.
  strippedDirs: [],
  // Vite builds the client and Nitro's Rollup builds the server. Counting bundles would still pass
  // with either plugin dropped, so each side is pinned to a marker only that side's source supplies.
  // Nitro defaults to `sourcemapExcludeSources: true`; the module flips it to `false`, which is the
  // only reason the server marker survives into `sourcesContent`.
  markers: { 'client source (Vite plugin)': CLIENT_MARKER, 'server source (Rollup plugin)': SERVER_MARKER },
  // Nitro copies Vite's client output to `CLIENT_OUTPUT`, and Sentry deletes no maps in Vite's own directory.
  debugIdsWithoutSourceMap: debugIdsOfChunksWithoutSourceMap(CLIENT_BUILD_OUTPUT),
});
console.log(`Found ${bundles.length} artifact bundle(s)\n`);

// --- Nuxt-specific checks on the upload ---

// Sentry rejects a release that names no project with a 400, and the mock server accepts anything,
// so assert on the body rather than on the call alone.
const releaseCreates = requests.filter(r => r.url?.includes('/releases') && r.method === 'POST');
assert.ok(releaseCreates.length > 0, 'Expected a POST to create the release');
for (const request of releaseCreates) {
  const body = request.jsonBody as { version?: string; projects?: string[] } | undefined;
  assert.equal(
    body?.version,
    'test-release',
    `Expected the release create body to carry the version, got ${JSON.stringify(body)}`,
  );
  assert.deepEqual(
    body?.projects,
    ['test-project'],
    `Expected the release create body to name the project, got ${JSON.stringify(body)}`,
  );
}

assert.ok(
  requests.some(r => r.url?.includes('/releases/') && r.method === 'PUT'),
  'Expected a PUT to finalize the release',
);

assert.ok(
  requests.some(r => r.url?.includes('/chunk-upload/') && r.method === 'GET'),
  'Expected a GET for the chunk-upload options',
);

for (const request of getAssembleRequests(requests)) {
  assert.ok((request.assembleBody?.chunks?.length ?? 0) > 0, 'Expected assemble request to have chunk checksums');
  for (const chunk of request.assembleBody?.chunks ?? []) {
    assert.match(chunk, /^[\da-f]{40}$/i, `Expected a SHA-1 chunk checksum, got: ${chunk}`);
  }
}

// `rewriteSources` normalizes `../../../foo` to `./foo` so paths stay resolvable in Sentry.
const unnormalizedSources = [...new Set(sourcemaps.flatMap(map => map.sourcemap.sources ?? []))].filter(
  source => source.startsWith('../') || path.isAbsolute(source),
);
assert.deepEqual(unnormalizedSources, [], `Expected every uploaded source to be normalized to './…'`);

const malformedDebugIds = [...uploadedDebugIds].filter(debugId => !UUID_REGEX.test(debugId));
assert.deepEqual(malformedDebugIds, [], 'Expected every uploaded debug ID to be a UUID');

for (const outputDir of isStaticBuild ? [CLIENT_OUTPUT] : [CLIENT_OUTPUT, SERVER_OUTPUT]) {
  // Nitro bundles the SSR build again, so its debug IDs can end up next to Nitro's own.
  // Reference issue: https://github.com/getsentry/sentry-javascript/issues/18519
  const filesWithMultipleDebugIds = findFilesWithMultipleDebugIds({ outputDir });
  assert.deepEqual(filesWithMultipleDebugIds, [], `Expected at most one debug ID per file in ${outputDir}`);

  // A server file can borrow the debug ID of its SSR build chunk. Then the upload check above passes on
  // Vite's map even if Nitro uploaded nothing.
  const filesWithForeignSourcemaps = findFilesWithForeignSourcemaps({ outputDir }, sourcemaps);
  assert.deepEqual(
    filesWithForeignSourcemaps,
    [],
    `Expected the source map uploaded for each file in ${outputDir} to be generated for that file`,
  );
}

// If both builds upload a map under a borrowed debug ID, Sentry can resolve with the wrong one.
const conflictingDebugIds = findDebugIdsWithConflictingSourcemaps(sourcemaps);
assert.deepEqual(conflictingDebugIds, [], 'Expected every uploaded debug ID to resolve to exactly one source map');

if (!isStaticBuild) {
  // Nitro bundles Vite's SSR output, so server frames reach `.vue` files only through the maps of that build.
  const serverDebugIds = new Set(findInjectedDebugIds({ outputDir: SERVER_OUTPUT }));
  const serverSources = sourcemaps
    .filter(map => map.debugId && serverDebugIds.has(map.debugId))
    .flatMap(map => getSourcemapSources(map.sourcemap));
  assert.ok(
    serverSources.some(source => source.endsWith('app/pages/index.vue')),
    `Expected the server source maps to resolve to app/pages/index.vue, got: ${serverSources.join(', ')}`,
  );
}
console.log('');

// --- What the build leaves behind in the client output ---

const clientSourceMaps = findSourceMapFiles({ outputDir: CLIENT_OUTPUT }).filter(isClientFile);

if (keepClientSourceMaps) {
  assert.ok(clientSourceMaps.length > 0, `Expected Sentry to leave the user-enabled maps in ${CLIENT_OUTPUT}`);
  console.log(`  ${clientSourceMaps.length} source map(s) kept in ${CLIENT_OUTPUT}, as configured\n`);
} else {
  // This directory is served to the internet, so a surviving `.map` hands out the original source.
  assert.deepEqual(clientSourceMaps, [], `Expected no source maps in ${CLIENT_OUTPUT} after upload`);

  // The maps are gone, so a surviving reference only 404s in devtools and leaks where they were.
  const danglingReferences = findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }).filter(isClientFile);
  assert.deepEqual(danglingReferences, [], `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`);

  // Catches source maps inlined as `data:` URIs, which the reference check above skips by design.
  const leakedSource = filesContaining(CLIENT_OUTPUT, CLIENT_MARKER).filter(isClientFile);
  assert.deepEqual(leakedSource, [], `Expected no original client source under ${CLIENT_OUTPUT}`);

  console.log(`  ${CLIENT_OUTPUT} is free of source maps, sourceMappingURL comments and original source\n`);
}

// --- What the build leaves behind in the server output ---

// Nuxt enables the server maps by default, so they are the user's and Sentry must keep them.
if (!isStaticBuild) {
  const serverSourceMaps = findSourceMapFiles({ outputDir: SERVER_OUTPUT });
  assert.ok(serverSourceMaps.length > 0, `Expected Sentry to keep the server source maps in ${SERVER_OUTPUT}`);
  console.log(`  ${serverSourceMaps.length} source map(s) kept in ${SERVER_OUTPUT}, as Nuxt enables them\n`);
}

// --- What the built server answers for the client source maps ---

// `nuxt generate` emits no server, and a static host serves only the files that exist. The other presets build a
// server for their platform, which Node cannot start.
if (!isStaticBuild && nitroPreset === 'node-server') {
  const clientChunkUrls = fs
    .readdirSync(CLIENT_OUTPUT, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(
      entry => `/${path.relative(CLIENT_OUTPUT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`,
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
      clientChunkUrls.map(async chunkUrl => {
        const mapUrl = `${chunkUrl}.map`;
        const expectedStatus = fs.existsSync(path.join(CLIENT_OUTPUT, mapUrl)) ? 200 : 404;
        const { status } = await fetch(`${server.baseUrl}${mapUrl}`);
        return { mapUrl, status, expectedStatus };
      }),
    );
    const unexpectedStatuses = responses
      .filter(({ status, expectedStatus }) => status !== expectedStatus)
      .map(({ mapUrl, status, expectedStatus }) => `${mapUrl} → ${status}, expected ${expectedStatus}`);
    assert.deepEqual(
      unexpectedStatuses,
      [],
      'Expected the server to answer each client source map URL with 200 if the map is in the output, else 404',
    );

    console.log(`  The server answers all ${clientChunkUrls.length} client source map URL(s) as expected\n`);
  } finally {
    await server.close();
  }
}

console.log('All sourcemap assertions passed!');
