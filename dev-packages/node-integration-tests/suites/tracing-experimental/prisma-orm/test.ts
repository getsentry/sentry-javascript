import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';

conditionalTest({ min: 16 })('Prisma ORM Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            method: 'create',
            model: 'User',
            name: 'User.create',
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:client:operation',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:client:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:client:connect',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.type': 'postgres',
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine:connection',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'db.statement': expect.stringContaining(
              'INSERT INTO "public"."User" ("createdAt","email","name") VALUES ($1,$2,$3) RETURNING "public"."User"."id", "public"."User"."createdAt", "public"."User"."email", "public"."User"."name" /* traceparent',
            ),
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine:db_query',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine:response_json_serialization',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            method: 'findMany',
            model: 'User',
            name: 'User.findMany',
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:client:operation',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:client:serialize',
          status: 'ok',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            'otel.kind': 'INTERNAL',
            'sentry.origin': 'manual',
          }),
          description: 'prisma:engine',
          status: 'ok',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
