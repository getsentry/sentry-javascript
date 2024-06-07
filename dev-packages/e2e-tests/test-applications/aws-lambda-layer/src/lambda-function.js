const Sentry = require('@sentry/aws-serverless');

const http = require('http');

function handle() {
  Sentry.startSpanManual({ name: 'aws-lambda-layer-test-txn', op: 'test' }, span => {
    http.get('http://example.com', res => {
      res.on('data', d => {
        process.stdout.write(d);
      });

      res.on('end', () => {
        span.end();
      });
    });
  });
}

module.exports = { handle };
