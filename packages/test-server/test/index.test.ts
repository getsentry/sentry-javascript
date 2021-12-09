import { RelayTestServer } from '../';
import * as got from 'got';
import { readFileSync } from 'fs';
import { join } from 'path';

async function sendFileToRelay(file: string): Promise<void> {
  const path = join(__dirname, file);
  const body = readFileSync(path);
  await got.default.post('http://localhost:3000/api/12345/envelope/?sentry_key=37f8a2ee37c0409d8970bc7559c7c7e4', {
    body,
    headers: { 'content-type': 'application/x-sentry-envelope' },
  });
}

describe('@sentry-internal/test-server', () => {
  let server: RelayTestServer;

  beforeAll(async () => {
    server = new RelayTestServer();
    await server.start();
  });

  afterAll(async () => {
    if (server) {
      server.stop();
    }
  });

  beforeEach(() => {
    server.clearEvents();
  });

  test('Good event', async done => {
    expect.assertions(6);

    await sendFileToRelay('good.bin');
    await server.waitForEvents(1);

    expect(server.errors.length).toEqual(0);
    expect(server.events.length).toEqual(1);

    // Do a few sanity checks to ensure things are there
    const event = server.events[0];
    expect(event.headers.sent_at).toEqual('2021-12-09T18:10:14.004Z');
    expect(event.items.length).toEqual(2);

    const item = event.items[1];
    expect(item.headers.content_type).toEqual('application/json');
    expect(item.payload.contexts.app.app_name).toEqual('offline-native-crash');

    done();
  });

  test('Bad event', async done => {
    expect.assertions(1);
    try {
      await sendFileToRelay('bad.bin');
    } catch (e) {
      expect(e?.message).toEqual('Response code 400 (Bad Request)');
    }
    done();
  });
});
