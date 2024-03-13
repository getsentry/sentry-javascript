// preact does not support more modern TypeScript versions, which breaks our users that depend on older
// TypeScript versions. To fix this, we alias preact module to a shim for our <4.9 TS users.

// Path: build/npm/types-ts3.8/global.d.ts

const fs = require('fs');
const path = require('path');

function run() {
  fs.copyFileSync(
    path.join('scripts', 'global-test.d.ts.tmpl'),
    path.join('build', 'npm', 'types-ts3.8', 'global.d.ts'),
  );
}

run();
