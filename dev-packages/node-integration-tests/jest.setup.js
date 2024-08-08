const { cleanupChildProcesses } = require('./utils/runner');

jest.setTimeout(15000);

afterEach(() => {
  cleanupChildProcesses();
});
