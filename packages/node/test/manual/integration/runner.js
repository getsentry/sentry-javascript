const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { colorize } = require('../colorize');

const nodeVersion = parseInt(process.version.match(/^v(\d+)\./)[1]);
const scenariosDirs = ['express'];
const scenarios = [];

// Fastify is only supported on Node 14+
if (nodeVersion >= 14) {
  scenariosDirs.push('fastify');
}

for (const dir of scenariosDirs) {
  const scenarioDir = path.resolve(__dirname, dir);
  const filenames = fs.readdirSync(scenarioDir);
  const paths = filenames.map(filename => [filename, path.resolve(scenarioDir, filename)]);
  scenarios.push(...paths);
}

const processes = scenarios.map(([filename, filepath]) => {
  return new Promise(resolve => {
    const scenarioProcess = spawn('node', [filepath], { timeout: 10000 });
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
