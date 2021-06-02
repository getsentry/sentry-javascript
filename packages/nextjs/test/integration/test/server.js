const path = require('path');
const { run } = require('./runner');
const { createNextServer, startServer } = require('./utils/common');

const setup = async () => {
  const server = await createNextServer({ dev: false, dir: path.resolve(__dirname, '..') });
  return startServer(server);
};

const teardown = async ({ server }) => {
  return new Promise(resolve => server.close(resolve));
};

run({
  setup,
  teardown,
  scenariosDir: path.resolve(__dirname, './server'),
});
