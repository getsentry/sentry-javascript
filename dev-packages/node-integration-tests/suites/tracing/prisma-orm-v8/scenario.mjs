// ESM-only package: the CJS variant gets the namespace from `require(esm)`, so the factory is read off `default`.
import * as prismaPostgres from '@prisma/orm-postgres/runtime';
import * as Sentry from '@sentry/node';
import { randomBytes } from 'crypto';
import contractJson from './prisma/contract.json' with { type: 'json' };

const url = 'postgresql://prisma:prisma@localhost:5436/tests';

async function run() {
  const db = prismaPostgres.default({ contractJson, url });

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async () => {
      // With `require(esm)` the module-injection notice arrives on a later tick, so a call in the same
      // tick as the require would run before the SDK subscribes to the channels.
      await new Promise(resolve => setImmediate(resolve));

      await db.orm.public.User.create({
        name: 'Tilda',
        email: `tilda_${randomBytes(4).toString('hex')}@sentry.io`,
      });

      await db.orm.public.User.all();

      await db.orm.public.User.where(user => user.email.like('%sentry.io')).delete();
    },
  );

  await db.close();
}

run();
