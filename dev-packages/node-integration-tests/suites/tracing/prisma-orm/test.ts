import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';

conditionalTest({ min: 16 })('Prisma ORM Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            method: 'create',
            model: 'User',
            name: 'User.create',
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:client:operation',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:client:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:client:connect',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:engine',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'db.type': 'postgres',
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:engine:connection',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'db.statement': expect.stringContaining(
              'INSERT INTO "public"."User" ("createdAt","email","name") VALUES ($1,$2,$3) RETURNING "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" /* traceparent',
            ),
            'sentry.origin': 'auto.db.otel.prisma',
            'db.system': 'prisma',
            'sentry.op': 'db',
          },
          description: expect.stringContaining(
            'INSERT INTO "public"."User" ("createdAt","email","name") VALUES ($1,$2,$3) RETURNING "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" /* traceparent',
          ),
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:engine:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:engine:response_json_serialization',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            method: 'findMany',
            model: 'User',
            name: 'User.findMany',
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:client:operation',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:client:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: {
            'sentry.origin': 'auto.db.otel.prisma',
          },
          description: 'prisma:engine',
          status: 'ok',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
