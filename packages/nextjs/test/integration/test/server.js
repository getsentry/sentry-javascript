const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

const next = require('next');

const { run } = require('./runner');

const setup = async () => {
  const app = next({ dev: false, dir: path.resolve(__dirname, '..') });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));

  return new Promise((resolve, reject) => {
    server.listen(0, err => {
      if (err) {
        reject(err);
      } else {
        resolve({
          server,
          url: `http://localhost:${server.address().port}`,
        });
      }
    });
  });
};

const teardown = async ({ server }) => {
  return new Promise(resolve => server.close(resolve));
};

run({
  setup,
  teardown,
  scenariosDir: path.resolve(__dirname, './server'),
});
