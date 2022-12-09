// Run with
// node --expose-gc inspect benchmarks/memory/benchmark.memory.js to attach a debugger and take heap snapshots
const { CpuProfilerBindings } = require('../../lib/sentry_cpu_profiler.js');

function iterateOverLargeHashTable() {
  const table = {};
  for (let i = 0; i < 1e6; i++) {
    table[i] = i;
  }
  // eslint-disable-next-line
  for (const _ in table) {
    // Breaks v8 optimization as object enters hash table mode
    // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#52-the-object-being-iterated-is-not-a-simple-enumerable
  }
}

const profiled = (name, fn) => {
  CpuProfilerBindings.startProfiling(name);
  fn();
  return CpuProfilerBindings.stopProfiling(name);
};

for (let i = 0; i < 10; i++) {
  profiled('profiled-program', async () => {
    iterateOverLargeHashTable();
  });
}

(async () => {
  const promise = new Promise((resolve) => {
    process.on('SIGINT', function () {
      resolve(0);
      process.exit();
    });

    console.log('Memory before:', `${process.memoryUsage().heapUsed}B`);
    for (let i = 0; i < 100; i++) {
      profiled(`test-${i}`, iterateOverLargeHashTable);
    }
    console.log('Memory  after:', `${process.memoryUsage().heapUsed}B`);
    global.gc();
    console.log('Memory after gc:', `${process.memoryUsage().heapUsed}B`);
    console.table();
  });

  await promise;
})();
