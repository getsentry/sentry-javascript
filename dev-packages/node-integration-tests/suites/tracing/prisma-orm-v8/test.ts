import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests, describeWithDockerCompose } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

// Prisma 8 ("Prisma Next") has no tracing surface (its scorecard lists OpenTelemetry spans as not in 8.0), so
// `prismaIntegration` is inert and only the `pg` spans from `postgresIntegration` remain. Pinned here so a
// Prisma release that adds a tracing surface shows up. The runtime runs on every Node version in the matrix;
// only the Prisma 8 CLI needs Node 22.18+, which is why the generated files are committed.
describe('Prisma ORM v8 Tests', () => {
  describeWithDockerCompose('Prisma ORM v8', { workingDirectory: [__dirname] }, () => {
    createEsmAndCjsTests(
      __dirname,
      'scenario.mjs',
      'instrument.mjs',
      (createRunner, test) => {
        test('should instrument PostgreSQL queries from Prisma ORM via pg', { timeout: 75_000 }, async () => {
          await createRunner()
            .unordered()
            .expect({
              span: container => {
                const segment = container.items.find(item => item.is_segment);
                expect(segment?.name).toBe('Test Transaction');

                const querySpans = container.items.filter(
                  item =>
                    item.attributes['sentry.origin']?.value === 'auto.db.postgres' &&
                    item.attributes['db.query.text']?.value,
                );
                expect(querySpans.map(span => span.name)).toEqual(
                  expect.arrayContaining([
                    'INSERT "public"."user"',
                    'SELECT "public"."user"',
                    'DELETE "public"."user"',
                  ]),
                );
                querySpans.forEach(span => {
                  expect(span.attributes['sentry.op']?.value).toBe('db');
                  expect(span.attributes['db.system.name']?.value).toBe('postgresql');
                  expect(span.parent_span_id).toBe(segment?.span_id);
                });

                expect(
                  container.items.filter(item => item.attributes['sentry.origin']?.value === 'auto.db.prisma'),
                ).toEqual([]);
              },
            })
            .start()
            .completed();
        });
      },
      {
        additionalDependencies: {
          '@prisma/orm-postgres': '8.0.0-rc.8',
        },
        copyPaths: ['prisma'],
      },
    );
  });
});
