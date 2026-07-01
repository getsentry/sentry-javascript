import type { D1Database } from '@cloudflare/workers-types';
import { PrismaD1 } from '@prisma/adapter-d1';
import * as Sentry from '@sentry/cloudflare/nodejs_compat';
import { PrismaClient } from './generated';

interface Env {
  SENTRY_DSN: string;
  DB: D1Database;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
    integrations: [Sentry.prismaIntegration()],
  }),
  {
    async fetch(_request, env) {
      // miniflare starts with an empty D1 database, so create the table Prisma expects.
      await env.DB.exec(
        'CREATE TABLE IF NOT EXISTS User (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT)',
      );

      const adapter = new PrismaD1(env.DB);
      const prisma = new PrismaClient({ adapter });

      const users = await prisma.user.findMany();

      return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  } satisfies ExportedHandler<Env>,
);
