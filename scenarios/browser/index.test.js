const { promises, statSync } = require('fs');
const path = require('path');

const runWebpack = require('./webpack');

function expectNotToExist(module, consumedModules) {
  const matching = consumedModules.find(mod => mod.includes(module));
  expect(matching).not.toContain(module);
}

function getPathByScenario(scenario) {
  return path.resolve(__dirname, 'dist', scenario, 'main.js');
}

async function getBundleAsString(scenario) {
  const pathname = getPathByScenario(scenario);
  const bundle = await promises.readFile(pathname);

  return bundle.toString();
}

function getBundleSize(scenario) {
  const bundleStats = statSync(getPathByScenario(scenario));
  const rounded = (bundleStats.size / 1024).toFixed(2);
  return `${rounded} Kb`;
}

// Example case ["scenario", ["list", "of", "unwelcome", "modules"], ["list", "of", "unwelcome", "methods"]]
const cases = [
  ['basic', ['minimal'], ['captureException']],
  ['basic-capture-exception', ['minimal'], ['captureException']],
];

describe.each(cases)('scenario: "%s"', (scenario, unwelcomeModules, unwelcomeMethods) => {
  let consumedModules;
  let bundleAsAString;

  beforeAll(async () => {
    consumedModules = await runWebpack(scenario);
    bundleAsAString = await getBundleAsString(scenario);
  });

  // Dummy test. Used to pretty print the bundle size per scenario.
  test(`Bundle size: ${getBundleSize(scenario)}`, () => {});

  test.each(unwelcomeModules)(`module: "%s" should not be present`, async unwelcomeModule => {
    expectNotToExist(unwelcomeModule, consumedModules);
  });

  test.each(unwelcomeMethods)(`method: "%s" should not be present`, async unwelcomeMethod => {
    expect(bundleAsAString).not.toContain(`${unwelcomeMethod}=function`);
  });
});
