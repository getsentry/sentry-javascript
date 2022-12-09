const fs = require('fs');
const suite = require('benchmark');
const { CpuProfilerBindings } = require('./../../lib/cpu_profiler');

console.log('\nBenchmarking CPU profiler use cases');

// 0(2^n) on purpose
const fibonacci = (n) => {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
};

const random = (len) => {
  let str = '';
  let start = 0;
  while (start < len) {
    str += Math.floor(Math.random());
    start++;
  }

  return str;
};

const noop = () => {};

suite
  .Suite()
  .add(`Fibonacci`, () => {
    fibonacci(10);
  })
  .add(`Fibonacci (profiled)`, () => {
    CpuProfilerBindings.startProfiling('test');
    fibonacci(10);
    CpuProfilerBindings.stopProfiling('test');
  })
  .add(`Disk I/O`, () => {
    const outfile = './profile.json';
    if (fs.existsSync(outfile)) {
      fs.unlinkSync(outfile);
    }
    fs.writeFileSync('profile.json', random(2 << 12));
  })
  .add(`Disk I/O (profiled)`, () => {
    CpuProfilerBindings.startProfiling('test');
    const outfile = './profile.json';
    if (fs.existsSync(outfile)) {
      fs.unlinkSync(outfile);
    }
    fs.writeFileSync('profile.json', random(2 << 12));
    CpuProfilerBindings.stopProfiling('test');
  })
  .add('Long task', () => {
    const started = performance.now();
    while (true) {
      if (performance.now() - started > 500) {
        break;
      }
      noop();
    }
  })
  .add('Long task (profiled)', () => {
    CpuProfilerBindings.startProfiling('test');
    const started = performance.now();
    while (true) {
      if (performance.now() - started > 500) {
        break;
      }
      noop();
    }
    CpuProfilerBindings.stopProfiling('test');
  })
  .on('error', (error) => {
    console.log('error', error);
  })
  .on('complete', function () {
    const result = this.sort((a, b) => a.stats.hz - b.stats.hz)
      .map((n) => n.toString())
      .join('\n');

    console.log(result);
  })
  // Do not run async tests as only 1 profiler is available to each thread
  .run({ async: false });
