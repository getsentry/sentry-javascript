import { getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should correctly send envelope', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);

  const errorEnvelope = envelopes[1];

  expect(errorEnvelope).toHaveLength(3);
  expect(errorEnvelope[2]).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'test_simple_error',
        },
      ],
    },
    release: '1.0',
    event_id: expect.any(String),
    timestamp: expect.any(Number),
  });
});
