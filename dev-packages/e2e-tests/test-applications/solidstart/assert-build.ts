import * as path from 'node:path';
import { assertSourceMapUpload } from '@sentry-internal/test-utils';

const CLIENT_OUTPUT = path.join('.output', 'public');
const SERVER_OUTPUT = path.join('.output', 'server');

// The app does not set `build.sourcemap`, so the SDK enables hidden maps and must delete them after upload.
// Vinxi writes the server output after the SDK deleted the maps, so `.output/server` keeps Nitro's own maps,
// which carry no mappings. They are not served, so only the client output must be free of maps.
assertSourceMapUpload({
  outputDirs: [CLIENT_OUTPUT, SERVER_OUTPUT],
  strippedDirs: [CLIENT_OUTPUT],
  markers: { 'client source': 'SOURCEMAP_MARKER_CLIENT', 'server source': 'SOURCEMAP_MARKER_SERVER' },
});

console.log('All sourcemap assertions passed!');
