const Sentry = require('@sentry/aws-serverless');

const http = require('http');

async function handle() {
  await Sentry.startSpan({ name: 'manual-span', op: 'test' }, async () => {
    await new Promise(resolve => {
      http.get('http://example.com', res => {
        res.on('data', d => {
          process.stdout.write(d);
        });

        res.on('end', () => {
          resolve();
        });
      });
    });
  });
}

module.exports = { handle };
