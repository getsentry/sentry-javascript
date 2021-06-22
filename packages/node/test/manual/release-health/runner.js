const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const COLOR_RESET = '\x1b[0m';
const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

const colorize = (str, color) => {
  if (!(color in COLORS)) {
    throw new Error(`Unknown color. Available colors: ${Object.keys(COLORS).join(', ')}`);
  }

  return `${COLORS[color]}${str}${COLOR_RESET}`;
};

const scenariosDirs = ['session-aggregates', 'single-session'];
const scenarios = [];

for (const dir of scenariosDirs) {
  const scenarioDir = path.resolve(__dirname, dir);
  const filenames = fs.readdirSync(scenarioDir);
  const paths = filenames.map(filename => [filename, path.resolve(scenarioDir, filename)]);
  scenarios.push(...paths);
}

const processes = scenarios.map(([filename, filepath]) => {
  return new Promise(resolve => {
    const scenarioProcess = spawn('/usr/bin/env', ['node', filepath]);
    const output = [];
    const errors = [];

    scenarioProcess.stdout.on('data', data => {
      output.push(data.toString());
    });

    scenarioProcess.stderr.on('data', data => {
      errors.push(data.toString());
    });

    scenarioProcess.on('exit', code => {
      if (code === 0) {
        console.log(colorize(`PASSED: ${filename}`, 'green'));
      } else {
        console.log(colorize(`FAILED: ${filename}`, 'red'));

        if (output.length) {
          console.log(colorize(output.join('\n'), 'yellow'));
        }
        if (errors.length) {
          console.log(colorize(errors.join('\n'), 'yellow'));
        }
      }

      resolve(code);
    });
  });
});

Promise.all(processes).then(codes => {
  if (codes.some(code => code !== 0)) {
    process.exit(1);
  }
});
