const { cleanupChildProcesses } = require('./utils/runner');

// Increases test timeout from 5s to 45s
jest.setTimeout(45000);

afterEach(() => {
  cleanupChildProcesses();
});
