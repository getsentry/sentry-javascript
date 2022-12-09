const quantile = (arr, q) => {
  arr.sort();
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  } else {
    return arr[base];
  }
};
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const hz = (ops, arr) => {
  return (ops / sum(arr)) * 1000;
};
const stdev = (arr) => Math.sqrt(variance(arr));
const variance = (arr) => {
  const m = mean(arr);
  return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
};

const variancepct = (arr) => {
  const m = mean(arr);
  return arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length / m;
};

function computeRunResults(arr) {
  return {
    hz: hz(arr.length, arr),
    mean: mean(arr),
    stdev: stdev(arr),
    variance: variance(arr),
    variancepct: '±' + (variancepct(arr) * 100).toFixed(2) + '%',
    p75: quantile(arr, 0.75),
    p99: quantile(arr, 0.99)
  };
}

function benchmark(name, n, { before, run, cleanup }) {
  const timings = [];

  for (let i = 0; i < n; i++) {
    if (before) before();
    const start = performance.now();
    run();
    const end = performance.now();
    if (cleanup) cleanup();
    timings.push(end - start);
  }

  const results = computeRunResults(timings);
  console.log(
    `${name} N=${n}`,
    `ops/s ${results.hz.toFixed(2)} mean ${results.mean.toFixed(2)}ms ±${results.stdev.toFixed(2)}ms ${
      results.variancepct
    }`
  );
}

const fibonacci = (n) => {
  if (n <= 1) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
};

module.exports = {
  quantile,
  mean,
  sum,
  hz,
  fibonacci,
  stdev,
  variance,
  variancepct,
  computeRunResults,
  benchmark
};
