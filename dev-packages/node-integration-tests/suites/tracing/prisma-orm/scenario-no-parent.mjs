import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';

async function run() {
  const client = new PrismaClient();

  assert.deepEqual(await client.$queryRawUnsafe('SELECT 1 AS before_parent'), [{ before_parent: 1 }]);

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, async () => {
    assert.deepEqual(await client.$queryRawUnsafe('SELECT 2 AS inside_parent'), [{ inside_parent: 2 }]);
  });

  assert.deepEqual(await client.$queryRawUnsafe('SELECT 3 AS after_parent'), [{ after_parent: 3 }]);
  await client.$disconnect();

  // Flush every operation before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
