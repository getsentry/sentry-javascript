const { readFile, writeFile } = require('node:fs').promises;
const pjson = require(`${process.cwd()}/package.json`);

const REPLACE_REGEX = /\d+\.\d+.\d+(?:-\w+(?:\.\w+)?)?/g;

async function run() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.error('[versionbump] Please provide files to bump');
    process.exit(1);
  }

  try {
    await Promise.all(
      files.map(async file => {
        const data = String(await readFile(file, 'utf8'));
        await writeFile(file, data.replace(REPLACE_REGEX, pjson.version));
      }),
    );

    // eslint-disable-next-line no-console
    console.log(`[versionbump] Bumped version for ${files.join(', ')}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[versionbump] Error occurred:', error);
    process.exit(1);
  }
}

run();
