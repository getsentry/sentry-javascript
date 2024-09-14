const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

const PORT = 3005;

const run = async () => {
  const app = express();
  app.use(cors());

  const expressServer = http.createServer(app);

  const io = new Server(expressServer);

  app.get('/', (_req, res) => {
    io.emit('test', 'TEST MESSAGE');
    res.send('123');
  });

  expressServer.listen(PORT, () => {
    io.on('connection', client => {
      client.on('test_reply', _data => {
        client.disconnect();
        io.close();
      });
    });

    const clientSocket = ioc(`http://localhost:${PORT}`);

    clientSocket.on('test', _msg => {
      clientSocket.emit('test_reply', { test_key: 'test_value' });
    });
  });

  sendPortToRunner(PORT);
};

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
