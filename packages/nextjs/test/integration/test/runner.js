const fs = require('fs').promises;
const path = require('path');

const yargs = require('yargs/yargs');

const { colorize, verifyDir } = require('./utils/common');
const { error, log } = console;

const argv = yargs(process.argv.slice(2))
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
    description: 'Set the logging depth for intercepted requests (default = 4)',
  }).argv;

const runScenario = async (scenario, execute, env) => {
  try {
    await execute(require(scenario), { ...env });
    log(colorize(`✓ Scenario succeded: ${path.basename(scenario)}`, 'green'));
    return true;
  } catch (error) {
    const scenarioFrames = error.stack.split('\n').filter(l => l.includes(scenario));

    if (scenarioFrames.length === 0) {
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
    const line = scenarioFrames[0].match(/.+:(\d+):/)[1];
    log(colorize(`X Scenario failed: ${path.basename(scenario)} (line: ${line})`, 'red'));
    log(error.message);
    return false;
  }
};

const runScenarios = async (scenarios, execute, env) => {
  return Promise.all(
    scenarios.map(scenario => {
      return runScenario(scenario, execute, env);
    }),
  );
};

module.exports.run = async ({
  setup = async () => {},
  teardown = async () => {},
  execute = async (scenario, env) => scenario(env),
  scenariosDir,
}) => {
  try {
    await verifyDir(scenariosDir);

    let scenarios = await fs.readdir(scenariosDir);
    if (argv.filter) {
      scenarios = scenarios.filter(file => file.toLowerCase().includes(argv.filter.toLowerCase()));
    }
    scenarios = scenarios.map(s => path.resolve(scenariosDir, s));

    if (scenarios.length === 0) {
      log('No scenarios found');
      process.exit(0);
    } else {
      if (!argv.silent) {
        scenarios.forEach(s => log(`⊙ Scenario found: ${path.basename(s)}`));
      }
    }
    // Silence all the unnecessary server noise. We are capturing errors manualy anyway.
    if (argv.silent) {
      for (const level of ['log', 'warn', 'info', 'error']) {
        console[level] = () => {};
      }
    }

    const env = {
      argv,
      ...(await setup({ argv })),
    };
    const results = await runScenarios(scenarios, execute, env);
    const success = results.every(Boolean);
    await teardown(env);

    if (success) {
      log(colorize(`✓ All scenarios succeded`, 'green'));
      process.exit(0);
    } else {
      log(colorize(`X Some scenarios failed`, 'red'));
      process.exit(1);
    }
  } catch (e) {
    error(e.message);
    process.exit(1);
  }
};
