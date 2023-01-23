import { NextTestEnv } from '../utils/server';

// This test asserts that our wrapping of `res.end` doesn't break API routes on Vercel if people call `res.json` or
// `res.send` multiple times in one request handler.
//  https://github.com/getsentry/sentry-javascript/issues/6670
it.skip('should not break API routes on Vercel if people call res.json or res.send multiple times in one request handler', async () => {
  if (process.env.NODE_MAJOR === '10') {
    console.log('not running doubleEndMethodOnVercel test on Node 10');
    return;
  }
  const env = await NextTestEnv.init();
  const url = `${env.url}/api/doubleEndMethodOnVercel`;
  const response = await env.getAPIResponse(url);

  expect(response).toMatchObject({
    success: true,
  });
});
