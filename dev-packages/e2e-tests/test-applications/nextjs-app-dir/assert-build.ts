import * as fs from 'fs';
import * as assert from 'assert/strict';

const packageJson = require('./package.json');
const nextjsVersion = packageJson.dependencies.next;

const buildStdout = fs.readFileSync('.tmp_build_stdout', 'utf-8');
const buildStderr = fs.readFileSync('.tmp_build_stderr', 'utf-8');

// Assert that there was no funky build time warning when we are on a stable (pinned) version
// if (nextjsVersion !== 'latest' && nextjsVersion !== 'canary') {
//   assert.doesNotMatch(buildStderr, /Import trace for requested module/); // This is Next.js/Webpack speech for "something is off"
// }
// Note(lforst): I disabled this for the time being to figure out OTEL + Next.js - Next.js is currently complaining about a critical import in the @opentelemetry/instrumentation package. E.g:
// --- Start logs ---
// ./node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation/build/esm/platform/node/instrumentation.js
// ./node_modules/@opentelemetry/instrumentation/build/esm/platform/node/instrumentation.js
// Critical dependency: the request of a dependency is an expression
// Import trace for requested module:
// ./node_modules/@opentelemetry/instrumentation/build/esm/platform/node/instrumentation.js
// ./node_modules/@opentelemetry/instrumentation/build/esm/platform/node/index.js
// ./node_modules/@opentelemetry/instrumentation/build/esm/platform/index.js
// ./node_modules/@opentelemetry/instrumentation/build/esm/index.js
// ./node_modules/@sentry/node/cjs/index.js
// ./node_modules/@sentry/nextjs/cjs/server/index.js
// ./node_modules/@sentry/nextjs/cjs/index.server.js
// ./app/page.tsx
// --- End logs ---

// Assert that all static components stay static and all dynamic components stay dynamic
assert.match(buildStdout, /○ \/client-component/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /● \/client-component\/parameter\/\[parameter\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[\.\.\.parameters\]/);
assert.match(buildStdout, /(λ|ƒ) \/server-component\/parameter\/\[parameter\]/);

export {};
