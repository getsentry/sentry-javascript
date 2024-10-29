import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('Reporting API', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('should forward Reporting API requests as raw CSP envelopes', done => {
    const runner = createRunner(__dirname, 'server.mjs')
      .expect({
        raw_security: {
          'csp-report': {
            'document-uri': 'https://localhost:9000/',
            referrer: '',
            'blocked-uri': 'https://example.com/script.js',
            'effective-directive': 'script-src-elem',
            'original-policy': "default-src 'self'; report-to csp-endpoint",
            disposition: 'enforce',
            'status-code': 200,
            status: '200',
            sample: '',
          },
        },
      })
      .start(done);

    runner.makeRequest(
      'post',
      '/reporting-api',
      { 'Content-Type': 'application/reports+json' },
      JSON.stringify([
        {
          age: 0,
          body: {
            blockedURL: 'https://example.com/script.js',
            disposition: 'enforce',
            documentURL: 'https://localhost:9000/',
            effectiveDirective: 'script-src-elem',
            originalPolicy: "default-src 'self'; report-to csp-endpoint",
            referrer: '',
            sample: '',
            statusCode: 200,
          },
          type: 'csp-violation',
          url: 'https://localhost:9000/',
          user_agent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
      ]),
    );
  });
});
