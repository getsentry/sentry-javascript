import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('withStaticSpan applies changes to child spans', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: event => {
        expect(event.spans).toHaveLength(1);

        const childSpan = event.spans![0]!;
        expect(childSpan.description).toBe('customChildSpanName');
        expect(childSpan.data['sentry.custom_attribute']).toBe('customAttributeValue');
      },
    })
    .start()
    .completed();
});

test('withStaticSpan applies changes to the root span', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: event => {
        expect(event.transaction).toBe('customRootSpanName');
        expect(event.contexts?.trace?.data?.['sentry.custom_root_attribute']).toBe('customRootAttributeValue');
      },
    })
    .start()
    .completed();
});

test('a beforeSendSpan callback without withStaticSpan is not invoked in the static trace lifecycle', async () => {
  await createRunner(__dirname, 'scenario-unwrapped.ts')
    .expect({
      transaction: event => {
        expect(event.transaction).toBe('test-span');
        expect(event.spans).toHaveLength(1);
        expect(event.spans![0]!.description).toBe('test-child-span');
      },
    })
    .start()
    .completed();
});
