const fs = require('fs').promises;
const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

const yargs = require('yargs/yargs');
const next = require('next');
const puppeteer = require('puppeteer');

const {
  colorize,
  extractEnvelopeFromRequest,
  extractEventFromRequest,
  isEventRequest,
  isSentryRequest,
  isSessionRequest,
  isTransactionRequest,
  logIf,
} = require('./utils');
const { log } = console;

/**
 * client.js
 *
 * Start the test-runner
 *
 * Options:
 *   --filter   Filter scenarios based on filename (case-insensitive)      [string]
 *   --silent   Hide all stdout and console logs except test results      [boolean]
 *   --debug    Log intercepted requests and debug messages               [boolean]
 *   --depth    Set the logging depth for intercepted requests             [number]
 */

const argv = yargs(process.argv.slice(2))
  .command('$0', 'Start the test-runner')
  .option('filter', {
    type: 'string',
    description: 'Filter scenarios based on filename (case-insensitive)',
  })
  .option('silent', {
    type: 'boolean',
    description: 'Hide all stdout and console logs except test results',
  })
  .option('debug', {
    type: 'boolean',
    description: 'Log intercepted requests and debug messages',
  })
  .option('depth', {
    type: 'number',
    description: 'Set the logging depth for intercepted requests',
  }).argv;

(async () => {
  let scenarios = await fs.readdir(path.resolve(__dirname, './client'));

  if (argv.filter) {
    scenarios = scenarios.filter(file => file.toLowerCase().includes(argv.filter));
  }

  if (scenarios.length === 0) {
    log('No test suites found');
    process.exit(0);
  } else {
    if (!argv.silent) {
      scenarios.forEach(s => log(`⊙ Test suites found: ${s}`));
    }
  }

  // Silence all the unnecessary server noise. We are capturing errors manualy anyway.
  if (argv.silent) {
    console.log = () => {};
    console.error = () => {};
  }

  const app = next({ dev: false, dir: path.resolve(__dirname, '..') });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));

  const browser = await puppeteer.launch({
    devtools: false,
  });

  const success = await new Promise(resolve => {
    server.listen(0, err => {
      if (err) throw err;

      const cases = scenarios.map(async testCase => {
        const page = await browser.newPage();
        page.setDefaultTimeout(2000);

        page.on('console', msg => logIf(argv.debug, msg.text()));

        // Capturing requests this way allows us to have a reproducible order,
        // where using `Promise.all([page.waitForRequest(isEventRequest), page.waitForRequest(isEventRequest)])` doesn't guarantee it.
        const testInput = {
          page,
          url: `http://localhost:${server.address().port}`,
          requests: {
            events: [],
            sessions: [],
            transactions: [],
          },
        };

        await page.setRequestInterception(true);
        page.on('request', request => {
          if (
            isSentryRequest(request) ||
            // Used for testing http tracing
            request.url().includes('http://example.com')
          ) {
            request.respond({
              status: 200,
              contentType: 'application/json',
              headers: {
                'Access-Control-Allow-Origin': '*',
              },
            });
          } else {
            request.continue();
          }

          if (isEventRequest(request)) {
            logIf(argv.debug, 'Intercepted Event', extractEventFromRequest(request), argv.depth);
            testInput.requests.events.push(request);
          }

          if (isSessionRequest(request)) {
            logIf(argv.debug, 'Intercepted Session', extractEnvelopeFromRequest(request), argv.depth);
            testInput.requests.sessions.push(request);
          }

          if (isTransactionRequest(request)) {
            logIf(argv.debug, 'Intercepted Transaction', extractEnvelopeFromRequest(request), argv.depth);
            testInput.requests.transactions.push(request);
          }
        });

        try {
          await require(`./client/${testCase}`)(testInput);
          log(colorize(`✓ Scenario succeded: ${testCase}`, 'green'));
          return true;
        } catch (error) {
          const testCaseFrames = error.stack.split('\n').filter(l => l.includes(testCase));
          if (testCaseFrames.length === 0) {
            log(error);
            return false;
          }
          /**
           * Find first frame that matches our scenario filename and extract line number from it, eg.:
           *
           * at assertObjectMatches (/test/integration/test/utils.js:184:7)
           * at module.exports.expectEvent (/test/integration/test/utils.js:122:10)
           * at module.exports (/test/integration/test/client/errorGlobal.js:6:3)
           */
          const line = testCaseFrames[0].match(/.+:(\d+):/)[1];
          log(colorize(`X Scenario failed: ${testCase} (line: ${line})`, 'red'));
          log(error.message);
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

  await browser.close();

  if (success) {
    log(colorize(`✓ All scenarios succeded`, 'green'));
    process.exit(0);
  } else {
    log(colorize(`X Some scenarios failed`, 'red'));
    process.exit(1);
  }
})();
