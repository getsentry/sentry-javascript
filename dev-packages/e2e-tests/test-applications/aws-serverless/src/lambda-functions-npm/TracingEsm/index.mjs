import * as http from 'node:http';
import * as Sentry from '@sentry/aws-serverless';

export const handler = async () => {
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
