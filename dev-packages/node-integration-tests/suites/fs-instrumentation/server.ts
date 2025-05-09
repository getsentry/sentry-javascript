import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1,
  integrations: [
    Sentry.fsIntegration({
      recordFilePaths: true,
      recordErrorMessagesAsSpanAttributes: true,
    }),
  ],
});

import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as util from 'util';

const app = express();

app.get('/readFile-error', async (_, res) => {
  try {
    await fs.promises.readFile(path.join(__dirname, 'fixtures', 'some-file-that-doesnt-exist.txt'), 'utf-8');
  } catch {
    // noop
  }
  res.send('done');
});

app.get('/readFile', async (_, res) => {
  await new Promise<void>(resolve => {
    fs.readFile(path.join(__dirname, 'fixtures', 'some-file.txt'), 'utf-8', () => {
      resolve();
    });
  });
  await fs.promises.readFile(path.join(__dirname, 'fixtures', 'some-file-promises.txt'), 'utf-8');
  await util.promisify(fs.readFile)(path.join(__dirname, 'fixtures', 'some-file-promisify.txt'), 'utf-8');
  res.send('done');
});

app.get('/copyFile', async (_, res) => {
  await new Promise<void>(resolve => {
    fs.copyFile(
      path.join(__dirname, 'fixtures', 'some-file.txt'),
      path.join(__dirname, 'fixtures', 'some-file.txt.copy'),
      () => {
        resolve();
      },
    );
  });
  await fs.promises.copyFile(
    path.join(__dirname, 'fixtures', 'some-file-promises.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promises.txt.copy'),
  );
  await util.promisify(fs.copyFile)(
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt.copy'),
  );
  res.send('done');
});

app.get('/link', async (_, res) => {
  await new Promise<void>(resolve => {
    fs.link(
      path.join(__dirname, 'fixtures', 'some-file.txt'),
      path.join(__dirname, 'fixtures', 'some-file.txt.link'),
      () => {
        resolve();
      },
    );
  });
  await fs.promises.link(
    path.join(__dirname, 'fixtures', 'some-file-promises.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promises.txt.link'),
  );
  await util.promisify(fs.link)(
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt.link'),
  );

  await Promise.all([
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file.txt.link')),
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file-promises.txt.link')),
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file-promisify.txt.link')),
  ]);

  res.send('done');
});

app.get('/mkdtemp', async (_, res) => {
  await new Promise<void>(resolve => {
    fs.mkdtemp(path.join(os.tmpdir(), 'foo-'), () => {
      resolve();
    });
  });
  await fs.promises.mkdtemp(path.join(os.tmpdir(), 'foo-'));
  await util.promisify(fs.mkdtemp)(path.join(os.tmpdir(), 'foo-'));

  res.send('done');
});

app.get('/symlink', async (_, res) => {
  await new Promise<void>(resolve => {
    fs.symlink(
      path.join(__dirname, 'fixtures', 'some-file.txt'),
      path.join(__dirname, 'fixtures', 'some-file.txt.symlink'),
      () => {
        resolve();
      },
    );
  });
  await fs.promises.symlink(
    path.join(__dirname, 'fixtures', 'some-file-promises.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promises.txt.symlink'),
  );
  await util.promisify(fs.symlink)(
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt'),
    path.join(__dirname, 'fixtures', 'some-file-promisify.txt.symlink'),
  );

  await Promise.all([
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file.txt.symlink')),
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file-promises.txt.symlink')),
    fs.promises.unlink(path.join(__dirname, 'fixtures', 'some-file-promisify.txt.symlink')),
  ]);

  res.send('done');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
