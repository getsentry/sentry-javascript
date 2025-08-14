const Sentry = require('@sentry/aws-serverless');
const http = require('http');

exports.handler = async (event, context) => {
  console.log(process.version);
  console.log('PROCESS VERSION');
  await Sentry.startSpan({ name: 'manual-span', op: 'test' }, async () => {
    await new Promise(resolve => {
      http.get('http://example.com', res => {
        res.on('data', d => {
          process.stdout.write(process.version);
        });

        res.on('end', () => {
          resolve();
        });
      });
    });
  });
};
