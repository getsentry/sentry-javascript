// jest --config benchmarks/integrations/jest/ts/profiled/profiled.config.ts --detectOpenHandles && jest --config benchmarks/integrations/jest/ts/base/base.config.ts

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', (err) => {
  throw err;
});

// eslint-disable-next-line jest/no-jest-import
const jest = require('jest');

jest.run([
  '--config',
  'benchmarks/integrations/jest/profiled/profiled.config.ts',
  '--no-cache',
  '--no-watchman',
  '--no-watch',
  '--runInBand',
  '--silent',
  'benchmarks/integrations/jest/profiled/profiled.test.ts'
]);
