import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const POLYFILLS_DIR = '../../rollup/jsPolyfills';
const POLYFILLS_DESTINATION_DIR = 'jsPolyfills';

// copy our polyfills to the build folder
execSync(
  `rm -rf ${POLYFILLS_DESTINATION_DIR} &&
   mkdir ${POLYFILLS_DESTINATION_DIR} &&
   mkdir ${POLYFILLS_DESTINATION_DIR}/esm &&
   mkdir ${POLYFILLS_DESTINATION_DIR}/cjs &&
   cp ${POLYFILLS_DIR}/* ${POLYFILLS_DESTINATION_DIR}/esm &&
   cp ${POLYFILLS_DIR}/* ${POLYFILLS_DESTINATION_DIR}/cjs`,
  {
    stdio: 'inherit',
  },
);

// It's a little hacky, but given that all of the individual polyfills are written as `export const someFunction = ...`,
// the most straightforward (and computationally least expensive) way to convert them to CJS is through simple string
// substitution, so that they become `module.exports.someFunction = ...`. (The same applies to the index file, with
// `export { someFunction } from ...` becoming `module.exports.someFunction = require(...).someFunction`.)
const files = fs.readdirSync(`${POLYFILLS_DESTINATION_DIR}/cjs`);
files.forEach(file => {
  const filepath = path.resolve(`${POLYFILLS_DESTINATION_DIR}/cjs`, file);
  const contents = String(fs.readFileSync(filepath));
  const cjsified =
    file === 'index.js'
      ? contents.replace(/export { (\w+) } from ('\.\/\w+\.js')/g, 'module.exports.$1 = require($2).$1')
      : contents.replace(/export const /g, 'module.exports.');
  fs.writeFileSync(filepath, cjsified);
});
