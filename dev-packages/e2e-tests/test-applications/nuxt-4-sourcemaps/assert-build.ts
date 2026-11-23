import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';
import {
  assertSourceMapUpload,
  findDebugIdsWithConflictingSourcemaps,
  findFilesWithForeignSourcemaps,
  findFilesWithMultipleDebugIds,
  findInjectedDebugIds,
  findSourceMapFiles,
  findSourceMappingUrlComments,
  getAssembleRequests,
  getChunkUploadPosts,
  getSourcemapSources,
  loadMockServerResults,
  startNodeServer,
} from '@sentry-internal/test-utils';

/** This variant omits `sourcemaps.filesToDeleteAfterUpload`, so Sentry must upload but not delete. */
const keepClientSourceMaps = process.env.E2E_KEEP_CLIENT_SOURCEMAPS === 'true';

/** This variant has no auth token, so Sentry uploads nothing but still removes the client maps it enabled. */
const noUpload = process.env.E2E_NO_UPLOAD === 'true';

/** `nuxt generate` emits no `.output/server`. Keyed on the command so a missing one under `nuxt build` still fails. */
const isStaticBuild = process.env.NUXT_COMMAND === 'generate';

/** With `upload: false` and `delete: false`, Sentry uploads nothing and keeps the maps it enabled. */
const manualUpload = process.env.E2E_VARIANT === 'manual-upload';

/** The Vite server runs no Nitro, so Nuxt builds no `server/` routes. It also sets `delete: true`. */
const viteServer = process.env.E2E_VITE_SERVER === 'true';

/** With `delete: true`, Sentry removes the client maps the app enabled and the server maps Nuxt enables. */
const deleteAll = process.env.E2E_VARIANT === 'delete-all' || viteServer;

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
const SERVER_OUTPUT = outputDirs.server;

/** Both markers sit in comments, so bundlers strip them from the code but keep them in `sourcesContent`. */
const CLIENT_MARKER = 'SOURCEMAP_MARKER_CLIENT';
const SERVER_MARKER = 'SOURCEMAP_MARKER_SERVER';

/** Set as `release.name` in `nuxt.config.ts`. */
const RELEASE = 'test-release';

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

type NuxtRootContainer = HTMLElement & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } };

const ENVELOPE_URL = /\/api\/1337\/envelope\//;
const EVENT_ITEM_HEADER = '"type":"event"';

/** Opens the page, throws the client error, and resolves with the error event the browser SDK sends. */
async function captureClientErrorEvent(url: string): Promise<{ release?: string }> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.route(ENVELOPE_URL, route => route.fulfill({ status: 200, body: '{}' }));
    const eventRequest = page.waitForRequest(
      request => ENVELOPE_URL.test(request.url()) && (request.postData() ?? '').includes(EVENT_ITEM_HEADER),
    );

    await page.goto(url);
    // Server-rendered elements are clickable before Vue hydration attaches their event handlers.
    await page.waitForFunction(
      () => (document.getElementById('__nuxt') as NuxtRootContainer | null)?.__vue_app__?.$nuxt?.isHydrating === false,
    );
    await page.locator('#throw-error').click();

    const lines = ((await eventRequest).postData() ?? '').split('\n');
    return JSON.parse(lines[lines.findIndex(line => line.includes(EVENT_ITEM_HEADER)) + 1] as string);
  } finally {
    await browser.close();
  }
}

console.log(
  `Variant: ${isStaticBuild ? 'nuxt generate' : 'nuxt build'}, Nitro preset ${nitroPreset}, ` +
    `client source maps ${keepClientSourceMaps ? 'kept' : 'deleted'}${noUpload ? ', no upload' : ''}` +
    `${viteServer ? ', Vite server' : ''}\n`,
);

if (manualUpload) {
  assert.deepEqual(getChunkUploadPosts(loadMockServerResults()), [], 'Expected no source map upload');

  // The kept maps carry the debug IDs of their chunks, so an upload with the CLI needs no inject step.
  for (const outputDir of [CLIENT_OUTPUT, SERVER_OUTPUT]) {
    const mapDebugIds = new Set(
      findSourceMapFiles({ outputDir }).map(file => {
        const map = JSON.parse(fs.readFileSync(file, 'utf8')) as { debug_id?: string; debugId?: string };
        return (map.debug_id ?? map.debugId)?.toLowerCase();
      }),
    );
    const injectedDebugIds = findInjectedDebugIds({ outputDir });

    assert.ok(
      injectedDebugIds.some(debugId => mapDebugIds.has(debugId)),
      `Expected a kept source map with the debug ID of a chunk in ${outputDir}`,
    );
    console.log(`  ${outputDir}: ${injectedDebugIds.length} debug ID(s), ${mapDebugIds.size} kept source map(s)`);
  }
  console.log('');
} else if (!noUpload) {
  const { requests, bundles, sourcemaps, uploadedDebugIds } = assertSourceMapUpload({
    outputDirs: isStaticBuild ? [CLIENT_OUTPUT] : [CLIENT_OUTPUT, SERVER_OUTPUT],
    // The client output is checked below, because the "kept" variant expects its maps to stay and some presets
    // write the server into it.
    strippedDirs: [],
    // Vite builds the client and Nitro's Rollup builds the server. Counting bundles would still pass
    // with either plugin dropped, so each side is pinned to a marker only that side's source supplies.
    // Nitro defaults to `sourcemapExcludeSources: true`; the module flips it to `false`, which is the
    // only reason the server marker survives into `sourcesContent`.
    markers: viteServer
      ? { 'client source (Vite plugin)': CLIENT_MARKER }
      : { 'client source (Vite plugin)': CLIENT_MARKER, 'server source (Rollup plugin)': SERVER_MARKER },
    // Written by a plugin in `nuxt.config.ts`, because Sentry removes the client maps it enabled from the bundle.
    debugIdsWithoutSourceMap: '.tmp_debug_ids_without_source_map',
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
      RELEASE,
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
}

// --- What the build leaves behind in the client output ---

const clientSourceMaps = findSourceMapFiles({ outputDir: CLIENT_OUTPUT }).filter(isClientFile);

if (keepClientSourceMaps || manualUpload) {
  assert.ok(clientSourceMaps.length > 0, `Expected Sentry to leave the source maps in ${CLIENT_OUTPUT}`);
  // Hidden maps: nothing in the served bundles points to them.
  const references = findSourceMappingUrlComments({ outputDir: CLIENT_OUTPUT }).filter(isClientFile);
  assert.deepEqual(references, [], `Expected no sourceMappingURL comments in ${CLIENT_OUTPUT}`);
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

// The release changes on every commit, so a client chunk that contains it gets a new file name on every release.
// The Vite server inlines the public runtime config into a client chunk, together with a build ID that changes on
// every build.
if (!viteServer) {
  const clientChunksWithRelease = filesContaining(CLIENT_OUTPUT, RELEASE).filter(
    file => isClientFile(file) && file.endsWith('.js'),
  );
  assert.deepEqual(clientChunksWithRelease, [], `Expected no client chunk in ${CLIENT_OUTPUT} to contain the release`);
  console.log(`  No client chunk in ${CLIENT_OUTPUT} contains the release\n`);
}

// The client config plugin hands the release to the browser SDK only, so the server bundle needs it injected.
if (viteServer) {
  assert.ok(filesContaining(SERVER_OUTPUT, RELEASE).length > 0, `Expected the release in the ${SERVER_OUTPUT} bundle`);
  console.log(`  The ${SERVER_OUTPUT} bundle carries the release\n`);
}

// --- What the build leaves behind in the server output ---

// Nuxt enables the server maps by default, so they are the user's and Sentry must keep them, unless
// `sourcemaps.delete` is `true`.
if (!isStaticBuild && deleteAll) {
  assert.deepEqual(findSourceMapFiles({ outputDir: SERVER_OUTPUT }), [], `Expected no source maps in ${SERVER_OUTPUT}`);
  console.log(`  ${SERVER_OUTPUT} is free of source maps\n`);
} else if (!isStaticBuild) {
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

    const clientErrorEvent = await captureClientErrorEvent(server.baseUrl);
    assert.equal(clientErrorEvent.release, RELEASE, 'Expected the client error event to carry the release');
    console.log(`  The client error event carries the release ${RELEASE}\n`);
  } finally {
    await server.close();
  }
}

console.log('All sourcemap assertions passed!');
