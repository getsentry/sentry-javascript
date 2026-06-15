import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

describe('awsIntegration - DynamoDB', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('auto-instruments DynamoDB operations', async () => {
    await createRunner(__dirname, 'scenario.js')
      .ignore('event')
      .expect({
        transaction: {
          transaction: 'Test Transaction',
          spans: expect.arrayContaining([
            expect.objectContaining({
              description: 'DynamoDB.PutItem',
              op: 'db',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'sentry.origin': 'auto.otel.aws',
                'sentry.op': 'db',
                'rpc.system': 'aws-api',
                'rpc.method': 'PutItem',
                'rpc.service': 'DynamoDB',
                'db.system': 'dynamodb',
                'db.name': 'my-table',
                'db.operation': 'PutItem',
                'aws.dynamodb.table_names': ['my-table'],
                'otel.kind': 'CLIENT',
              }),
            }),
            expect.objectContaining({
              description: 'DynamoDB.Query',
              op: 'db',
              origin: 'auto.otel.aws',
              data: expect.objectContaining({
                'rpc.method': 'Query',
                'db.operation': 'Query',
                'db.name': 'my-table',
                'aws.dynamodb.count': 1,
                'aws.dynamodb.scanned_count': 1,
              }),
            }),
          ]),
        },
      })
      .start()
      .completed();
  });
});
