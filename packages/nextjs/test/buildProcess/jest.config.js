// In order to not have the build tests run as part of the unit test suite, we exclude them in
// `packages/nextjs/jest.config.js`. The resets the test-matching regex so that when `runTest.ts` calls `yarn jest` with
// ths config file, jest will find the tests in `tests`.
module.exports = require('../../../../jest/jest.config.js');
