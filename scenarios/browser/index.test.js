const { promises } = require('fs');
const path = require('path');

const runWebpack = require('./webpack');

function expectNotToExist(module, consumedModules) {
  const matching = consumedModules.find(mod => mod.includes(module));
  expect(matching).not.toContain(module);
}

async function getBundleAsString(scenario) {
  const bundle = await promises.readFile(path.resolve(__dirname, 'dist', scenario, 'main.js'));
  return bundle.toString();
}

// Example case ["scenario", ["list", "of", "unwelcome", "modules"], ["list", "of", "unwelcome", "methods"]]
const cases = [['basic', ['minimal'], ['captureException']]];

describe.each(cases)('scenario: "%s"', (scenario, unwelcomeModules, unwelcomeMethods) => {
  let consumedModules;
  let bundleAsAString;

  beforeAll(async () => {
    consumedModules = await runWebpack(scenario);
    bundleAsAString = await getBundleAsString(scenario);
  });

  test.each(unwelcomeModules)(`module: "%s" should not be present`, async unwelcomeModule => {
    expectNotToExist(unwelcomeModule, consumedModules);
  });

  test.each(unwelcomeMethods)(`method: "%s" should not be present`, async unwelcomeMethod => {
    expect(bundleAsAString).not.toContain(`${unwelcomeMethod}=function`);
  });
});
