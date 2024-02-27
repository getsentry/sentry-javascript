#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rimraf = require('rimraf');
const karma = require('karma');
const chokidar = require('chokidar');

const isDebugMode = process.argv.some(x => x === '--debug');
const isWatchMode = process.argv.some(x => x === '--watch');
const isManualMode = process.argv.some(x => x === '--manual');

function log(...message) {
  if (isDebugMode) {
    console.log(...message);
  }
}

function readFile(file) {
  return fs.readFileSync(path.resolve(__dirname, file), 'utf8');
}

function writeFile(file, data) {
  fs.writeFileSync(path.resolve(__dirname, file), data);
}

// eslint-disable-next-line no-unused-vars
function copyFile(from, to) {
  log('Copying file:\n\t=> from:', from, '\n\t=> to:', to);
  fs.copyFileSync(path.resolve(__dirname, from), path.resolve(__dirname, to));
}

function concatFiles(outputFile, inputFiles) {
  log('Concatinating:\n\t=> from:', inputFiles.join(', '), '\n\t=> to:', outputFile);
  writeFile(outputFile, inputFiles.map(file => readFile(file)).join('\n'));
}

function replacePlaceholders(templateFile) {
  log('Replacing placeholders for file:', templateFile);

  return readFile(templateFile).replace(/\{\{ ?([a-zA-Z-_./]+) ?\}\}/g, match => {
    const matchFile = match.slice(2, -2).trim();
    log('\t=> matched placeholder:', matchFile);
    return readFile(matchFile);
  });
}

function mkdir(dirpath) {
  fs.mkdirSync(path.resolve(__dirname, dirpath));
}

function rmdir(dirpath) {
  rimraf.sync(path.resolve(__dirname, dirpath));
}

function build() {
  log(`
╔════════════════════════════╗
║ INFO: Building test assets ║
╚════════════════════════════╝
`);

  rmdir('artifacts');
  mkdir('artifacts');

  concatFiles('artifacts/polyfills.js', [
    'polyfills/promise.js',
    'polyfills/fetch.js',
    'polyfills/raf.js',
    'polyfills/events.js',
  ]);

  writeFile(
    'artifacts/dedupe.js',
    readFile('../../../browser/build/bundles/dedupe.js').replace('//# sourceMappingURL=dedupe.js.map', ''),
  );
  concatFiles('artifacts/setup.js', ['artifacts/dedupe.js', 'common/utils.js', 'common/triggers.js', 'common/init.js']);
  rmdir('artifacts/dedupe.js');

  writeFile(
    'artifacts/sdk.js',
    readFile('../../build/bundles/bundle.js').replace('//# sourceMappingURL=bundle.js.map', ''),
  );
  writeFile(
    'artifacts/loader.js',
    readFile('../../src/loader.js').replace('../../build/bundles/bundle.js', '/base/artifacts/sdk.js'),
  );

  writeFile(
    'artifacts/tests.js',
    [readFile('polyfills/promise.js'), readFile('suites/helpers.js'), replacePlaceholders('suites/shell.js')].join(
      '\n',
    ),
  );
}

build();

let fileWatcher;
if (isWatchMode) {
  fileWatcher = chokidar
    .watch([path.resolve(__dirname, 'common'), path.resolve(__dirname, 'subjects'), path.resolve(__dirname, 'suites')])
    .on('change', build);
}

const karmaConfigOverrides = {
  ...(isWatchMode && {
    singleRun: false,
    autoWatch: true,
  }),
  ...(isManualMode && {
    customLaunchers: {},
    browsers: [],
  }),
};

new karma.Server(karma.config.parseConfig(path.resolve(__dirname, 'karma.conf.js'), karmaConfigOverrides), exitCode => {
  rmdir('artifacts');
  if (fileWatcher) fileWatcher.close();
  process.exit(exitCode);
}).start();
