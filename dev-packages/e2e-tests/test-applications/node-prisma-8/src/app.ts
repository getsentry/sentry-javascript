import { randomBytes } from 'node:crypto';
import postgres from '@prisma/orm-postgres/runtime';
import express from 'express';
import type { Contract } from './prisma/contract.d.ts';
import contractJson from './prisma/contract.json' with { type: 'json' };

const db = postgres<Contract>({
  contractJson,
  url: 'postgresql://prisma:prisma@localhost:5438/tests',
});

const app = express();
const port = 3030;

app.get('/test-prisma', async (_req, res) => {
  const created = await db.orm.public.User.create({
    name: 'Tilda',
    email: `tilda_${randomBytes(4).toString('hex')}@sentry.io`,
  });

  const users = await db.orm.public.User.all();

  await db.orm.public.User.where(user => user.email.like('%sentry.io')).delete();

  res.json({ created: created.id, count: users.length });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
