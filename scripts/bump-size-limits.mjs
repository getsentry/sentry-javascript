import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const SIZE_LIMIT_CONFIG = '.size-limit.js';

function roundUpToHalfKB(bytes) {
  return Math.ceil((bytes / 1024) * 2) / 2;
}

function run() {
  let output;
  try {
    output = execSync('yarn run --silent size-limit --json', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      // size-limit exits with non-zero when limits are exceeded, which is expected
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // size-limit exits with code 1 when limits are exceeded, but still writes JSON to stdout
    output = error.stdout;
    if (!output) {
      console.error('size-limit produced no output.');
      process.exit(1);
    }
  }

  let results;
  try {
    results = JSON.parse(output);
  } catch {
    console.error('Failed to parse size-limit JSON output.');
    console.error('Raw output:', output.slice(0, 500));
    process.exit(1);
  }

  const failedEntries = results.filter(r => !r.passed);

  if (failedEntries.length === 0) {
    console.log('All size-limit checks passed. Nothing to bump.');
    return;
  }

  console.log(`Found ${failedEntries.length} failing size-limit entries:`);

  let config = readFileSync(SIZE_LIMIT_CONFIG, 'utf-8');
  const summaryLines = [];

  for (const entry of failedEntries) {
    const actualSize = entry.size;
    const margin = Math.min(actualSize * 0.1, 1024);
    const newLimitKB = roundUpToHalfKB(actualSize + margin);
    const newLimitStr = `${newLimitKB} KB`;

    const nameEscaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(name:\\s*'${nameEscaped}'[\\s\\S]*?limit:\\s*')([^']+)(')`);

    const match = config.match(regex);
    if (!match) {
      console.error(`  WARNING: Could not find limit entry for "${entry.name}" in ${SIZE_LIMIT_CONFIG}`);
      continue;
    }

    const oldLimitStr = match[2];
    console.log(`  ${entry.name}: ${oldLimitStr} -> ${newLimitStr}`);
    summaryLines.push(`- \`${entry.name}\`: ${oldLimitStr} -> ${newLimitStr}`);

    config = config.replace(regex, `$1${newLimitStr}$3`);
  }

  writeFileSync(SIZE_LIMIT_CONFIG, config, 'utf-8');
  console.log(`\nUpdated ${SIZE_LIMIT_CONFIG}`);

  // Write summary to $GITHUB_OUTPUT for the PR comment step
  if (process.env.GITHUB_OUTPUT) {
    const summary = `Bumped size limits:\n${summaryLines.join('\n')}`;
    // Multi-line output requires delimiter syntax
    const delimiter = `EOF_${Date.now()}`;
    appendFileSync(process.env.GITHUB_OUTPUT, `summary<<${delimiter}\n${summary}\n${delimiter}\n`);
  }
}

run();
