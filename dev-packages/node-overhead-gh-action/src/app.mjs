import * as Sentry from '@sentry/node';
import express from 'express';
import mysql from 'mysql2/promise';

const app = express();
const port = 3030;

const pool = mysql.createPool({
  user: 'root',
  password: 'password',
  host: 'localhost',
  database: 'mydb',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

app.use(express.json());

app.get('/test-get', function (req, res) {
  res.send({ version: 'v1' });
});

app.post('/test-post', function (req, res) {
  const body = req.body;
  res.send(generateResponse(body));
});

app.get('/test-mysql', function (_req, res) {
  pool.query('SELECT * from users').then(([users]) => {
    res.send({ version: 'v1', users });
  });
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Example app listening on port ${port}`);
});

// This is complicated on purpose to simulate a real-world response
function generateResponse(body) {
  const bodyStr = JSON.stringify(body);
  const RES_BODY_SIZE = 10000;

  const bodyLen = bodyStr.length;
  let resBody = '';
  for (let i = 0; i < RES_BODY_SIZE; i++) {
    resBody += `${i}${bodyStr[i % bodyLen]}-`;
  }
  return { version: 'v1', length: bodyLen, resBody };
}
