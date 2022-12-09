const sqlite3 = require('sqlite3').verbose();
const autocannon = require('autocannon');

const express = require('express');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const { CpuProfilerBindings } = require('./../../lib/cpu_profiler');

const db = new sqlite3.Database('memory_db');

console.log('\nBenchmarking CPU profiler server use case');

db.serialize(() => {
  db.run('DROP TABLE IF EXISTS benchmarks;', (db, err) => {
    if (err) {
      console.log(err);
    }
  });

  db.run('CREATE TABLE IF NOT EXISTS benchmarks (id INTEGER PRIMARY KEY, name TEXT);', (res, err) => {
    if (err) {
      console.log('Table creation failed', res, err);
    }
  });

  db.parallelize(() => {
    for (let i = 0; i < 1e3; i++) {
      db.run(`INSERT INTO benchmarks (id, name) VALUES (?, ?);`, [i, `Benchmark ${i}`], (res, err) => {
        if (err) {
          console.log('Failed to insert with', err);
        }
      });
    }
  });
});

db.serialize(() => {
  db.get('SELECT COUNT(*) as c FROM benchmarks;', (err, row) => {
    if (err || row.c < 1e3) {
      throw new Error('Failed to prep db', err, row);
    }
  });
});

const html = (root) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SSR App</title>
  </head>

  <body>
    <div id="root">${root}</div>
    <script src="bundle.js"></script>
  </body>
</html>
`;

function App() {
  const [times, setTimes] = (function () {
    let start = 0;

    return [start, (newstart) => (start = newstart)];
  })();

  return React.createElement('div', { className: 'className' }, [
    React.createElement('h1', { key: 1 }, 'Hello World'),
    React.createElement('button', { key: 2, onClick: () => setTimes(times + 1) }, 'Click me')
  ]);
}

const api = express();
api.disable('etag');
api.disable('x-powered-by');

// isAlive
api.get('/benchmark/isAlive', (req, res) => {
  res.setHeader('content-type', 'text/plain');
  res.status(200).send('OK');
});

api.get('/benchmark/isAlive/profiled', (req, res) => {
  CpuProfilerBindings.startProfiling('isAlive - profiled');
  res.setHeader('content-type', 'text/plain');
  res.status(200).send('OK');
  CpuProfilerBindings.stopProfiling('isAlive - profiled');
});

// DB query
api.get('/benchmark/db', (req, res) => {
  res.setHeader('content-type', 'application/json');
  db.get(`SELECT * FROM benchmarks WHERE id = ${Math.floor(Math.random() * 100)}`, (err, row) => {
    res.status(200).json(row);
  });
});

api.get('/benchmark/db/profiled', (req, res) => {
  CpuProfilerBindings.startProfiling('db query');
  res.setHeader('content-type', 'application/json');
  db.get(`SELECT * FROM benchmarks WHERE id = ${Math.floor(Math.random() * 100)}`, (err, row) => {
    res.status(200).json(row);
  });
  CpuProfilerBindings.stopProfiling('db query');
});

// SSR
api.get('/benchmark/ssr', (req, res) => {
  res.status(200).send(html(ReactDOMServer.renderToString(App())));
});

api.get('/benchmark/ssr/profiled', (req, res) => {
  CpuProfilerBindings.startProfiling('react ssr');
  res.status(200).send(html(ReactDOMServer.renderToString(App())));
  CpuProfilerBindings.stopProfiling('react ssr');
});

// Start the server and run the benchmark
const server = api.listen(3000, async () => {
  const loadOptions = {
    connections: 10,
    pipelining: 1,
    duration: 10
  };

  // isAlive
  const isAliveRun = await autocannon({
    url: 'http://localhost:3000/benchmark/isAlive',
    ...loadOptions
  });
  console.log(`isAlive req/sec=${isAliveRun.requests.mean}`);

  const isAliveRunProfiled = await autocannon({
    url: 'http://localhost:3000/benchmark/isAlive/profiled',
    ...loadOptions
  });
  console.log(`isAlive (profiled) req/sec=${isAliveRunProfiled.requests.mean}`);

  // DB query
  const isAliveRunDb = await autocannon({
    url: 'http://localhost:3000/benchmark/db',
    ...loadOptions
  });
  console.log(`DB query req/sec=${isAliveRunDb.requests.mean}`);

  const isAliveRunDbProfiled = await autocannon({
    url: 'http://localhost:3000/benchmark/db/profiled',
    ...loadOptions
  });
  console.log(`DB query (profiled) req/sec=${isAliveRunDbProfiled.requests.mean}`);

  // SSR
  const ssr = await autocannon({
    url: 'http://localhost:3000/benchmark/ssr',
    ...loadOptions
  });
  console.log(`SSR req/sec=${ssr.requests.mean}`);

  const ssrProfiled = await autocannon({
    url: 'http://localhost:3000/benchmark/ssr/profiled',
    ...loadOptions
  });
  console.log(`SSR (profiled) req/sec=${ssrProfiled.requests.mean}`);

  server.close();
  db.close();
});
