#!/usr/bin/env node

const util = require('util');
const path = require('path');
const fs = require('fs');

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const appendFile = util.promisify(fs.appendFile);
const writeFile = util.promisify(fs.writeFile);
const exists = util.promisify(fs.exists);

const INJECTOR_CODE =
  '\n!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:{},n=(new Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="__DEBUG_ID__")}catch(e){}}()';

const DEBUG_COMMENT_CODE = '\n//# sentryDebugId=__DEBUG_ID__';

yargs(hideBin(process.argv))
  .command(
    'inject [targets...]',
    'correlates source maps and source files by injecting additional information',
    yargs => {
      return yargs.positional('targets', {
        describe: 'folders and/or files to scan for injection targets',
        default: ['.'],
      });
    },
    async ({ targets }) => {
      const normalizedAbsolutePaths = targets.map(target => path.resolve(target));

      normalizedAbsolutePaths.forEach(normalizedAbsolutePath => {
        if (!fs.existsSync(normalizedAbsolutePath)) {
          // eslint-disable-next-line no-console
          console.error(`Path ${normalizedAbsolutePath} not found.`);
          process.exit(1);
        }
      });

      const fileBuckets = await Promise.all(
        normalizedAbsolutePaths.map(normalizedAbsolutePath => {
          return getFilesFromAbsolutePath(normalizedAbsolutePath);
        }),
      );

      const filePaths = [...new Set([].concat(...fileBuckets))] // flatten and dedupe
        .filter(filePath => filePath.endsWith('.js'));

      await Promise.all(
        filePaths.map(async filePath => {
          const jsFileData = await readFile(filePath, 'utf8');

          const sourceMappingURLMatch = jsFileData.match(/^\/\/# sourceMappingURL=(.*)$/m);

          if (jsFileData.includes('//# sentryDebugId=')) {
            // eslint-disable-next-line no-console
            console.log(`Warning: File "${filePath}" was already processed. Will skip processing for this file.`);
            return;
          }

          if (!sourceMappingURLMatch) {
            // eslint-disable-next-line no-console
            console.log(
              `Warning: File "${filePath}" doesn't have a "sourceMappingURL" comment. Will skip processing for this file.`,
            );
            return;
          }

          const normalizedSourceMapURL = path.normalize(sourceMappingURLMatch[1]);
          const sourceMapPath = path.join(path.dirname(filePath), normalizedSourceMapURL);

          if (!(await exists(sourceMapPath))) {
            // eslint-disable-next-line no-console
            console.log(
              `Warning: "sourceMappingURL" comment of file "${filePath}" doesn't point to an existing file. Will skip processing for this file.`,
            );
            return;
          }

          const sourceMapContents = await readFile(sourceMapPath, 'utf8');

          let sourceMap;
          try {
            sourceMap = JSON.parse(sourceMapContents);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log(`Warning: Failed to parse source map ${sourceMapPath}. Will skip processing for this file.`);
            return;
          }

          const debugID = Math.floor(Math.random() * 100000000000);
          const codeToInject = `${INJECTOR_CODE}${DEBUG_COMMENT_CODE}`.replace(/__DEBUG_ID__/g, debugID);

          sourceMap.debugID = debugID;

          return await Promise.all([
            writeFile(sourceMapPath, JSON.stringify(sourceMap), { encoding: 'utf8', flag: 'w' }),
            appendFile(filePath, codeToInject),
          ]);
        }),
      );
    },
  )
  .parse();

async function getFilesFromAbsolutePath(absolutePath) {
  const stats = await lstat(absolutePath);

  if (stats.isFile()) {
    return [absolutePath];
  } else if (stats.isDirectory) {
    const files = await readdir(absolutePath);
    const results = await Promise.all(files.map(file => getFilesFromAbsolutePath(path.join(absolutePath, file))));
    return [].concat(...results); // flatten
  } else {
    return [];
  }
}
