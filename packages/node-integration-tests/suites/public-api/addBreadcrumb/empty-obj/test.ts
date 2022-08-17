import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should add an empty breadcrumb, when an empty object is given', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config);

  expect(envelope).toHaveLength(3);

  assertSentryEvent(envelope[2], {
    message: 'test-empty-obj',
  });
});
