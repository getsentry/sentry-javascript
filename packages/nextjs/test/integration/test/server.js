const fs = require('fs').promises;
const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

const next = require('next');

const { DEBUG_MODE } = require('./utils');
const { log } = console;

/**
 * Usage: node server.js <filename>
 *
 * ENV Variables:
 * DEBUG=[bool] - enable request and application logs
 * DEBUG_DEPTH=[int] - set logging depth
 *
 * Arguments:
 * <filename> - filter tests based on filename partial match
 */

const FILES_FILTER = process.argv[2];

(async () => {
  let scenarios = await fs.readdir(path.resolve(__dirname, './server'));

  if (FILES_FILTER) {
    scenarios = scenarios.filter(file => file.toLowerCase().includes(FILES_FILTER));
  }

  if (scenarios.length === 0) {
    log('No tests founds.');
    process.exit(0);
  } else {
    if (DEBUG_MODE) {
      scenarios.forEach(s => log(`⊙ Tests Found: ${s}`));
    }
  }

  // Silence all the unnecessary server noise. We are capturing errors manualy anyway.
  if (!DEBUG_MODE) {
    console.log = () => {};
    console.error = () => {};
  }

  const app = next({ dev: false, dir: path.resolve(__dirname, '..') });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));

  const success = await new Promise(resolve => {
    server.listen(0, err => {
      if (err) throw err;

      const cases = scenarios.map(async testCase => {
        const testInput = {
          url: `http://localhost:${server.address().port}`,
        };

        try {
          await require(`./server/${testCase}`)(testInput);
          log(`\x1b[32m✓ Test Succeded: ${testCase}\x1b[0m`);
          return true;
        } catch (error) {
          const testCaseFrames = error.stack.split('\n').filter(l => l.includes(testCase));
          const line = testCaseFrames[0].match(/.+:(\d+):/)[1];
          log(`\x1b[31mX Test Failed: ${testCase} (line: ${line})\x1b[0m\n${error.message}`);
          return false;
        }
      });

      Promise.all(cases).then(result => {
        // Awaiting server being correctly closed and resolving promise in it's callback
        // adds ~4-5sec overhead for some reason. It should be safe to skip it though.
        server.close();
        resolve(result.every(Boolean));
      });
    });
  });

  if (success) {
    log(`\x1b[32m✓ All Tests Succeded\x1b[0m`);
    process.exit(0);
  } else {
    log(`\x1b[31mX Some Tests Failed\x1b[0m`);
    process.exit(1);
  }
})();
