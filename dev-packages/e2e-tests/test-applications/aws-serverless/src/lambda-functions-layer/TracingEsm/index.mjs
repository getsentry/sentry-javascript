import * as Sentry from '@sentry/aws-serverless';

import * as http from 'node:http';

export const handler = async () => {
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
};
