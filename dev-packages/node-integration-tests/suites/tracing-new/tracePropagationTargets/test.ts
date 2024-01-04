import nock from 'nock';

import { TestEnv, runScenario } from '../../../utils';

test('HttpIntegration should instrument correct requests when tracePropagationTargets option is provided', async () => {
  const match1 = nock('http://match-this-url.com')
    .get('/api/v0')
    .matchHeader('baggage', val => typeof val === 'string')
    .matchHeader('sentry-trace', val => typeof val === 'string')
    .reply(200);

  const match2 = nock('http://match-this-url.com')
    .get('/api/v1')
    .matchHeader('baggage', val => typeof val === 'string')
    .matchHeader('sentry-trace', val => typeof val === 'string')
    .reply(200);

  const match3 = nock('http://dont-match-this-url.com')
    .get('/api/v2')
    .matchHeader('baggage', val => val === undefined)
    .matchHeader('sentry-trace', val => val === undefined)
    .reply(200);

  const match4 = nock('http://dont-match-this-url.com')
    .get('/api/v3')
    .matchHeader('baggage', val => val === undefined)
    .matchHeader('sentry-trace', val => val === undefined)
    .reply(200);

  const env = await TestEnv.init(__dirname);
  await runScenario(env.url);

  env.server.close();
  nock.cleanAll();

  await new Promise(resolve => env.server.close(resolve));

  expect(match1.isDone()).toBe(true);
  expect(match2.isDone()).toBe(true);
  expect(match3.isDone()).toBe(true);
  expect(match4.isDone()).toBe(true);
});
