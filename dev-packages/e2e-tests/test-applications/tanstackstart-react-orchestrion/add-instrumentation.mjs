import { readFileSync, writeFileSync } from 'node:fs';

// Prepend the Sentry server init to the built Nitro server entry so it runs at
// process boot — before the first request and before `node:http` is set up.
//
// TanStack Start lazy-loads the request-handler module (src/server.ts), so an
// `import` there only runs on the first request: too late for `Sentry.init()`
// to patch `node:http`, leaving the first request without an `http.server`
// transaction (its spans come in orphaned). This mirrors how `@sentry/nuxt`
// injects the server config into Nitro's entry, and removes the need for
// `node --import` (which isn't available on platforms like Vercel/Netlify).
const entryFile = '.output/server/index.mjs';
const topImport = "import './instrument.server.mjs';\n";

const contents = readFileSync(entryFile, 'utf8');

if (!contents.startsWith(topImport)) {
  writeFileSync(entryFile, topImport + contents, 'utf8');
}
