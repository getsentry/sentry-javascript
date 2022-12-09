const React = require('react');
const ReactDOMServer = require('react-dom/server');
const fs = require('fs');
const path = require('path');
const gzip = require('zlib');
const { ZSTDCompress } = require('simple-zstd');

const { mean, stdev, variancepct, variance, quantile } = require('./../cpu/utils');
const cpu_profiler = require('../../build/Release/sentry_cpu_profiler.node');
const { threadId } = require('worker_threads');

const relativeChange = (final, initial) => {
  if (initial === 0) return '0%';
  const change = ((final - initial) / initial) * 100;
  if (change > 0) return '+' + change.toFixed(2) + '%';
  return change.toFixed(2) + '%';
};

function App() {
  const [times, setTimes] = (function () {
    let start = 0;

    return [start, (newstart) => (start = newstart)];
  })();

  return React.createElement('div', { className: 'className' }, [
    React.createElement('main', { key: 0 }, [
      React.createElement('h1', { key: 0 }, 'Hello World'),
      React.createElement('button', { key: 1, onClick: () => setTimes(times + 1) }, 'Click me'),

      React.createElement('section', { key: 2 }, [
        React.createElement('h3', { key: 0 }, 'Subtitle'),
        React.createElement('p', { key: 1 }, 'Paragraph'),
        React.createElement('div', { key: 2 }, [React.createElement('small', { key: 0 }, 'Tiny text')])
      ])
    ])
  ]);
}

function render() {
  for (let i = 0; i < 2 << 16; i++) {
    ReactDOMServer.renderToString(App());
  }
}

function benchmark(cb, n) {
  const outpath = path.resolve(__dirname, 'output');
  const formats = ['graph', 'sampled'];
  const compressions = ['gz', 'br', 'zst'];
  const measures = {};

  for (let i = 0; i < n; i++) {
    const profile = cb();
    compress(profile, outpath);

    for (const format of formats) {
      const name = `cpu_profiler.${format}.json`;
      measures[format] = measures[format] || [];
      measures[format].push(getSize(path.resolve(outpath, name)));

      for (const compression of compressions) {
        const compressed = `${name}.${compression}`;
        const size = getSize(path.resolve(outpath, compressed));
        if (!measures[compressed]) measures[compressed] = [];
        measures[compressed].push(size);
      }
    }
  }

  if (!process.env.RUN_NAME) {
    throw new Error('Pass RUN_NAME as env variable so we can compare results');
  }

  const saveAs = path.resolve(__dirname, `./results/${process.env.RUN_NAME}.json`);

  if (fs.existsSync(saveAs)) {
    fs.unlinkSync(saveAs);
  }

  fs.writeFileSync(saveAs, JSON.stringify(measures, null, 2));
  console.log(`Benchmarks for N=${n}`);
}

function computeResults(json) {
  const results = {};

  for (const key in json) {
    const values = json[key];
    results[key] = {
      mean: mean(values),
      stdev: stdev(values),
      variance: variance(values),
      variancepct: '±' + (variancepct(values) * 100).toFixed(2) + '%',
      p75: quantile(values, 0.75)
    };
  }
  return results;
}

function compareResults(before, after) {
  console.log('Comparing results from', before, 'and', after);
  console.log(`Logged results are results of ${after} with changes relative to ${before}`);
  const beforeStats = require(path.resolve(__dirname, `./results/${before}.json`));
  const afterStats = require(path.resolve(__dirname, `./results/${after}.json`));

  const beforeResults = computeResults(beforeStats);
  const afterResults = computeResults(afterStats);

  for (const key in afterResults) {
    if (!beforeResults[key]) {
      throw new Error('Key', key, 'does not exist in', before, 'results, benchmarks are not comparable');
    }
    console.log(`${key}: ${afterResults[key].p75} (${relativeChange(afterResults[key].p75, beforeResults[key].p75)})`);
  }
}

function getSize(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Path ${path} does not exist`);
  }

  return fs.statSync(path).size;
}

function compressGzip(source, target) {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.openSync(target, 'w');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(source);
    stream
      .pipe(gzip.createGzip({ level: 6 }))
      .pipe(fs.createWriteStream(target))
      .on('finish', () => {
        resolve();
      })
      .on('error', () => {
        reject(new Error('Error while compressing file', target));
        reject();
      });
  });
}

function compressBrotli(source, target) {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.openSync(target, 'w');
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(source);
    stream
      .pipe(gzip.createBrotliCompress())
      .pipe(fs.createWriteStream(target))
      .on('finish', () => {
        resolve();
      })
      .on('error', () => {
        reject(new Error('Error while compressing file', target));
        reject();
      });
  });
}

function compressZstd(source, target) {
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.openSync(target, 'w');
  return new Promise((resolve, reject) => {
    fs.createReadStream(source)
      .pipe(ZSTDCompress(3))
      .pipe(fs.createWriteStream(target))
      .on('finish', () => {
        resolve();
      })
      .on('error', () => {
        reject(new Error('Error while compressing file', target));
        reject();
      });
  });
}

async function compress(sampledProfile, outpath) {
  // We should really do this when we compile the binary
  const cleanGraphFormat = (format) => {
    const { stacks, samples, ...rest } = format;
    return rest;
  };

  const cleanSampledFormat = (format) => {
    const { top_down_root, ...rest } = format;
    return rest;
  };

  if (fs.existsSync(path.resolve(outpath, 'cpu_profiler.graph.json'))) {
    fs.unlinkSync(path.resolve(outpath, 'cpu_profiler.graph.json'));
  }
  if (fs.existsSync(path.resolve(outpath, 'cpu_profiler.sampled.json'))) {
    fs.unlinkSync(path.resolve(outpath, 'cpu_profiler.sampled.json'));
  }

  fs.writeFileSync(path.resolve(outpath, 'cpu_profiler.graph.json'), JSON.stringify(cleanGraphFormat(sampledProfile)));
  fs.writeFileSync(
    path.resolve(outpath, 'cpu_profiler.sampled.json'),
    JSON.stringify(cleanSampledFormat(sampledProfile))
  );

  // Compress graph format to gzip
  await compressGzip(
    path.resolve(outpath, 'cpu_profiler.graph.json'),
    path.resolve(outpath, 'cpu_profiler.graph.json.gz')
  );

  // Compress sampled format to gzip
  await compressGzip(
    path.resolve(outpath, 'cpu_profiler.sampled.json'),
    path.resolve(outpath, 'cpu_profiler.sampled.json.gz')
  );

  // Compress graph format to Brotli
  await compressBrotli(
    path.resolve(outpath, 'cpu_profiler.graph.json'),
    path.resolve(outpath, 'cpu_profiler.graph.json.br')
  );

  // Compress sampled format to Brotli
  await compressBrotli(
    path.resolve(outpath, 'cpu_profiler.sampled.json'),
    path.resolve(outpath, 'cpu_profiler.sampled.json.br')
  ).catch((e) => console.log(e));

  // Compress graph format to Brotli
  await compressZstd(
    path.resolve(outpath, 'cpu_profiler.graph.json'),
    path.resolve(outpath, 'cpu_profiler.graph.json.zst')
  ).catch((e) => console.log(e));

  // Compress sampled format to Brotli
  await compressZstd(
    path.resolve(outpath, 'cpu_profiler.sampled.json'),
    path.resolve(outpath, 'cpu_profiler.sampled.json.zst')
  ).catch((e) => console.log(e));
}

if (process.env.RUN_NAME) {
  benchmark(() => {
    cpu_profiler.startProfiling('Sampled format');
    render();
    return cpu_profiler.stopProfiling('Sampled format', threadId);
  }, 10);
} else if (process.env.BEFORE && process.env.AFTER) {
  compareResults(process.env.BEFORE, process.env.AFTER);
} else {
  throw new Error('No run name or before/after specified');
}
