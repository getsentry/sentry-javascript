// Runs `nuxt build` with a sink on the Sentry tunnel port and records how many envelopes arrive,
// so tests can assert that prerendering sends no telemetry during the build.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

let envelopeCount = 0;
const sink = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    envelopeCount += 1;
    res.writeHead(200).end('{}');
  });
});

const sinkAvailable = await new Promise(resolve => {
  sink.once('error', () => resolve(false));
  sink.listen(3031, () => resolve(true));
});

const build = spawn('nuxt', ['build'], { stdio: 'inherit', shell: true });
const exitCode = await new Promise(resolve => build.on('exit', resolve));

sink.close();
mkdirSync('.output', { recursive: true });
writeFileSync(
  '.output/build-envelope-count.json',
  JSON.stringify({ envelopeCount: sinkAvailable ? envelopeCount : null }),
);
process.exit(exitCode ?? 1);
