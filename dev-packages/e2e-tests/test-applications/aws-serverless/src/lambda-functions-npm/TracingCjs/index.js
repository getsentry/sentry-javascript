const http = require('http');
const Sentry = require('@sentry/aws-serverless');

exports.handler = async () => {
  await new Promise(resolve => {
    const req = http.request(
      {
        host: 'example.com',
      },
      res => {
        res.on('data', d => {
          process.stdout.write(d);
        });

        res.on('end', () => {
          resolve();
        });
      },
    );
    req.end();
  });

  Sentry.startSpan({ name: 'manual-span', op: 'manual' }, () => {});
};
