const { cleanupChildProcesses } = require('./utils/runner');

// Default timeout: 15s
jest.setTimeout(15000);

afterEach(() => {
  cleanupChildProcesses();
});
