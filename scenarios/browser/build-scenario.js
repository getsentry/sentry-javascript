const { promises } = require('fs');

const inquirer = require('inquirer');

const runWebpack = require('./webpack');

async function init() {
  const scenarios = await getScenariosFromDirectories();

  const answers = await inquirer.prompt([
    {
      type: 'rawlist',
      name: 'scenario',
      message: 'Which scenario you want to run?',
      choices: scenarios,
      pageSize: scenarios.length,
      loop: false,
    },
  ]);

  console.log(`Bundling scenario: ${answers.scenario}`);

  await runWebpack(answers.scenario, 'static');
}

/**
 * Generates an array of available scenarios
 */
async function getScenariosFromDirectories() {
  const exclude = ['node_modules', 'dist', '~'];

  const dirents = await promises.readdir(__dirname, { withFileTypes: true });
  return dirents
    .filter(dirrent => dirrent.isDirectory())
    .map(dirent => dirent.name)
    .filter(dirName => !exclude.includes(dirName));
}

init();
