import { extractTraceparentData, parseBaggageHeader, TRACEPARENT_REGEXP } from '@sentry/core';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createCjsTests } from '../../../utils/runner';

type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

describe('express sentry-trace', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    describe('baggage header assignment', () => {
      test('Should overwrite baggage if the incoming request already has Sentry baggage data but no sentry-trace', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
          },
        });

        expect(response).toBeDefined();
        expect(response).not.toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
          },
        });
      });

      test('Should propagate sentry trace baggage data from an incoming to an outgoing request.', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,dogs=great,sentry-sample_rand=0.42',
          },
        });

        expect(response).toBeDefined();
        expect(response).toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,sentry-sample_rand=0.42',
          },
        });
      });

      test('Should not propagate baggage data from an incoming to an outgoing request if sentry-trace is faulty.', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            'sentry-trace': '',
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,dogs=great',
          },
        });

        expect(response).toBeDefined();
        expect(response).not.toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
            baggage: 'sentry-release=2.0.0,sentry-environment=myEnv',
          },
        });
      });

      test('Should not propagate baggage if sentry-trace header is present in incoming request but no baggage header', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
          },
        });

        expect(response).toBeDefined();
        expect(response).toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
          },
        });
      });

      test('Should not propagate baggage and ignore original 3rd party baggage entries if sentry-trace header is present', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
            baggage: 'foo=bar',
          },
        });

        expect(response).toBeDefined();
        expect(response).toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
          },
        });
      });

      test('Should populate and propagate sentry baggage if sentry-trace header does not exist', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

        expect(response).toBeDefined();

        const parsedBaggage = parseBaggageHeader(response?.test_data.baggage);

        expect(response?.test_data.host).toBe('somewhere.not.sentry');
        expect(parsedBaggage).toStrictEqual({
          'sentry-environment': 'prod',
          'sentry-release': '1.0',
          'sentry-public_key': 'public',
          // TraceId changes, hence we only expect that the string contains the traceid key
          'sentry-trace_id': expect.stringMatching(/\S*/),
          'sentry-sample_rand': expect.stringMatching(/\S*/),
          'sentry-sample_rate': '1',
          'sentry-sampled': 'true',
          'sentry-transaction': 'GET /test/express',
        });
      });

      test('Should populate Sentry and ignore 3rd party content if sentry-trace header does not exist', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
          headers: {
            baggage: 'foo=bar,bar=baz',
          },
        });

        expect(response).toBeDefined();
        expect(response?.test_data.host).toBe('somewhere.not.sentry');

        const parsedBaggage = parseBaggageHeader(response?.test_data.baggage);
        expect(parsedBaggage).toStrictEqual({
          'sentry-environment': 'prod',
          'sentry-release': '1.0',
          'sentry-public_key': 'public',
          // TraceId changes, hence we only expect that the string contains the traceid key
          'sentry-trace_id': expect.stringMatching(/\S*/),
          'sentry-sample_rand': expect.stringMatching(/\S*/),
          'sentry-sample_rate': '1',
          'sentry-sampled': 'true',
          'sentry-transaction': 'GET /test/express',
        });
      });
    });

    test('should attach a baggage header to an outgoing request.', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express-replace-trace-id');

      expect(response).toBeDefined();

      const baggage = response?.test_data.baggage?.split(',');

      [
        'sentry-environment=prod',
        'sentry-public_key=public',
        'sentry-release=1.0',
        'sentry-sample_rate=1',
        'sentry-sampled=true',
        'sentry-trace_id=__SENTRY_TRACE_ID__',
        'sentry-transaction=GET%20%2Ftest%2Fexpress-replace-trace-id',
        expect.stringMatching(/sentry-sample_rand=0\.\d+/),
      ].forEach(item => {
        expect(baggage).toContainEqual(item);
      });

      expect(response).toMatchObject({
        test_data: {
          host: 'somewhere.not.sentry',
        },
      });
    });

    test('should merge `baggage` header of a third party vendor with the Sentry DSC baggage items', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express-third-party-baggage', {
        headers: {
          'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'sentry-release=2.0.0,sentry-environment=myEnv,sentry-sample_rand=0.42',
        },
      });

      expect(response).toBeDefined();
      expect(response).toMatchObject({
        test_data: {
          host: 'somewhere.not.sentry',
          baggage:
            'other=vendor,foo=bar,third=party,sentry-release=2.0.0,sentry-environment=myEnv,sentry-sample_rand=0.42',
        },
      });
    });

    describe('third party baggage with sentry entries', () => {
      test('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with incoming DSC', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>(
          'get',
          '/test/express-third-party-baggage-with-sentry',
          {
            headers: {
              'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
              baggage: 'sentry-release=2.1.0,sentry-environment=myEnv',
            },
          },
        );

        expect(response).toBeDefined();

        const baggage = response?.test_data.baggage?.split(',').sort();

        expect(response).toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
          },
        });

        expect(baggage).toEqual([
          'foo=bar',
          'last=item',
          'other=vendor',
          'sentry-environment=myEnv',
          'sentry-release=2.1.0',
          expect.stringMatching(/sentry-sample_rand=\d+/),
          'third=party',
        ]);
      });

      test('should ignore sentry-values in `baggage` header of a third party vendor and overwrite them with new DSC', async () => {
        const runner = createRunner().start();

        const response = await runner.makeRequest<TestAPIResponse>(
          'get',
          '/test/express-third-party-baggage-with-sentry',
        );

        expect(response).toBeDefined();

        const baggage = response?.test_data.baggage?.split(',').sort();
        const sentryTraceHeader = response?.test_data['sentry-trace'];

        const sentryTrace = extractTraceparentData(sentryTraceHeader);

        expect(sentryTrace?.traceId).toMatch(/^[0-9a-f]{32}$/);

        expect(response).toMatchObject({
          test_data: {
            host: 'somewhere.not.sentry',
          },
        });

        expect(baggage).toEqual([
          'foo=bar',
          'last=item',
          'other=vendor',
          'sentry-environment=prod',
          'sentry-public_key=public',
          'sentry-release=1.0',
          expect.stringMatching(/sentry-sample_rand=\d+/),
          'sentry-sample_rate=1',
          'sentry-sampled=true',
          `sentry-trace_id=${sentryTrace?.traceId}`,
          'sentry-transaction=GET%20%2Ftest%2Fexpress-third-party-baggage-with-sentry',
          'third=party',
        ]);
      });
    });

    test('should preserve baggage property values with equal signs (W3C spec compliance)', async () => {
      const runner = createRunner().start();

      // W3C spec example: https://www.w3.org/TR/baggage/#example
      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express-property-values', {
        headers: {
          'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
          baggage: 'key1=value1;property1;property2,key2=value2,key3=value3; propertyKey=propertyValue',
        },
      });

      expect(response).toBeDefined();

      // The baggage should be parsed and re-serialized, preserving property values with = signs
      const baggageItems = response?.test_data.baggage?.split(',').map(item => decodeURIComponent(item.trim()));

      expect(baggageItems).toContain('key1=value1;property1;property2');
      expect(baggageItems).toContain('key2=value2');
      expect(baggageItems).toContain('key3=value3; propertyKey=propertyValue');
    });

    test('Includes transaction in baggage if the transaction name is parameterized', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

      expect(response).toBeDefined();
      expect(response).toMatchObject({
        test_data: {
          host: 'somewhere.not.sentry',
          baggage: expect.stringContaining('sentry-transaction=GET%20%2Ftest%2Fexpress'),
        },
      });
    });

    test('Should assign `sentry-trace` header which sets parent trace id of an outgoing request.', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express', {
        headers: {
          'sentry-trace': '12312012123120121231201212312012-1121201211212012-0',
        },
      });

      expect(response).toBeDefined();
      expect(response).toMatchObject({
        test_data: {
          host: 'somewhere.not.sentry',
          'sentry-trace': expect.stringContaining('12312012123120121231201212312012-'),
        },
      });

      expect(TRACEPARENT_REGEXP.test(response?.test_data['sentry-trace'] || '')).toBe(true);
    });

    test('should attach a `sentry-trace` header to an outgoing request.', async () => {
      const runner = createRunner().start();

      const response = await runner.makeRequest<TestAPIResponse>('get', '/test/express');

      expect(response).toBeDefined();
      expect(response).toMatchObject({
        test_data: {
          host: 'somewhere.not.sentry',
          'sentry-trace': expect.any(String),
        },
      });

      expect(TRACEPARENT_REGEXP.test(response?.test_data['sentry-trace'] || '')).toBe(true);
    });
  });
});
