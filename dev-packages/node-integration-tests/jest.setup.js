const { cleanupChildProcesses } = require('./utils/runner');

jest.setTimeout(45000);

afterEach(() => {
  cleanupChildProcesses();
});
