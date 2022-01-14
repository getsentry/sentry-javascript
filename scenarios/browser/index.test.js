const runWebpack = require('./webpack');

function expectNotToExist(module, consumedModules) {
  const matching = consumedModules.find(mod => mod.includes(module));

  expect(matching).not.toContain(module);
}

// Example ["scenario-name", ["list", "of", "unwelcome", "modules"]]
const cases = [
  ['basic', ['minimal']],
  ['basic-with-tunnel', ['minimal']],
];

test.each(cases)('scenario: %s', async (scenario, unwelcomeModules) => {
  const consumedModules = await runWebpack(scenario);

  unwelcomeModules.forEach(module => {
    expectNotToExist(module, consumedModules);
  });
});
