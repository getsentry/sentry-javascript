const { cleanupChildProcesses } = require('./utils/runner');

jest.setTimeout(25000);

afterEach(() => {
  cleanupChildProcesses();
});
