/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Express } from 'express';
import * as http from 'http';
import nock from 'nock';
import { getPortPromise } from 'portfinder';

const keysToReplace = {
  timestamp: expect.any(Number),
  event_id: expect.any(String),
  filename: expect.any(String),
  version: expect.any(String),
  lineno: expect.any(Number),
};

const deepReplace = (obj: Record<string, any>, keyName: string, replacer: (from: any) => string): void => {
  for (const key in obj) {
    if (key === keyName) {
      obj[key] = replacer(obj[key]);
    } else if (Array.isArray(obj[key])) {
      (obj[key] as any[]).forEach(member => deepReplace(member, keyName, replacer));
    } else if (typeof obj[key] === 'object') {
      deepReplace(obj[key], keyName, replacer);
    }
  }
};

const updateForSnapshot = (obj: Record<string, any>): Record<string, any> => {
  Object.entries(keysToReplace).forEach(([key, value]) => {
    deepReplace(obj, key, () => value);
  });

  return obj;
};

const parseEnvelope = (body: string): Record<string, unknown> => {
  const [envelopeHeaderString, itemHeaderString, itemString] = body.split('\n');

  return {
    envelopeHeader: JSON.parse(envelopeHeaderString),
    itemHeader: JSON.parse(itemHeaderString),
    item: JSON.parse(itemString),
  };
};

const getEventRequest = async (url: string): Promise<Record<string, any>> => {
  return new Promise(resolve => {
    nock('https://dsn.ingest.sentry.io')
      .post('/api/1337/store/', body => {
        resolve(body);
        return true;
      })
      .reply(200);

    http.get(url);
  });
};

const getEnvelopeRequest = async (url: string): Promise<Record<string, any>> => {
  return new Promise(resolve => {
    nock(/ingest\.sentry\.io/)
      .post(/api\/1337\/envelope/, body => {
        resolve(body);
        return true;
      })
      .reply(200);

    http.get(url);
  });
};

async function runServer(testDir: string): Promise<string> {
  const port = await getPortPromise();
  const url = `http://localhost:${port}/test`;

  await new Promise(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require(`${testDir}/server`).default as Express;

    app.get('/test', async () => {
      require(`${testDir}/init`);
      require(`${testDir}/subject`);

      setTimeout(() => server.close(), 500);
    });

    const server = app.listen(port, () => {
      resolve();
    });
  });

  return url;
}

export { parseEnvelope, getEventRequest, getEnvelopeRequest, updateForSnapshot, runServer };
