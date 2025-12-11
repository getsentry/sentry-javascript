import { describe, expect, it } from 'vitest';
import type { SpanV2JSON } from '../../../src';
import { safeSetSpanJSONAttributes, SentrySpan, spanToV2JSON } from '../../../src';
import { applyBeforeSendSpanCallback, contextsToAttributes } from '../../../src/spans/spanFirstUtils';

describe('safeSetSpanJSONAttributes', () => {
  it('only sets attributes that are not already set', () => {
    const span = new SentrySpan({ attributes: { 'app.name': 'original' }, name: 'spanName' });
    const spanJson = spanToV2JSON(span);

    const newAttributes = { 'app.name': 'new', 'app.version': '1.0.0' };
    safeSetSpanJSONAttributes(spanJson, newAttributes);

    expect(spanJson.attributes).toStrictEqual({
      'app.name': { type: 'string', value: 'original' },
      'app.version': { type: 'string', value: '1.0.0' },
      'sentry.origin': {
        type: 'string',
        value: 'manual',
      },
    });
  });

  it('creates an attributes object on the span if it does not exist', () => {
    const span = new SentrySpan({ name: 'spanName' });
    const spanJson = spanToV2JSON(span);
    spanJson.attributes = undefined;

    const newAttributes = { 'app.name': 'new', 'app.version': '1.0.0' };
    safeSetSpanJSONAttributes(spanJson, newAttributes);
    expect(spanJson.attributes).toStrictEqual({
      'app.name': { type: 'string', value: 'new' },
      'app.version': { type: 'string', value: '1.0.0' },
    });
  });

  it('sets attribute objects with units', () => {
    const span = new SentrySpan({ name: 'spanName' });
    const spanJson = spanToV2JSON(span);
    const newAttributes = { 'app.name': { value: 'new', unit: 'ms' }, 'app.version': '1.0.0' };
    safeSetSpanJSONAttributes(spanJson, newAttributes);
    expect(spanJson.attributes).toStrictEqual({
      'app.name': { type: 'string', value: 'new', unit: 'ms' },
      'app.version': { type: 'string', value: '1.0.0' },
      'sentry.origin': {
        type: 'string',
        value: 'manual',
      },
    });
  });

  it('ignores attribute values other than primitives, arrays and attribute objects', () => {
    const span = new SentrySpan({ name: 'spanName' });
    const spanJson = spanToV2JSON(span);
    const newAttributes = { foo: { bar: 'baz' } };
    safeSetSpanJSONAttributes(spanJson, newAttributes);
    expect(spanJson.attributes).toStrictEqual({
      'sentry.origin': {
        type: 'string',
        value: 'manual',
      },
    });
  });
});

describe('applyBeforeSendSpanCallback', () => {
  it('updates the span if the beforeSendSpan callback returns a new span', () => {
    const span = new SentrySpan({ name: 'originalName' });
    const spanJson = spanToV2JSON(span);
    const beforeSendSpan = (_span: SpanV2JSON) => {
      return { ...spanJson, name: 'newName' };
    };
    const result = applyBeforeSendSpanCallback(spanJson, beforeSendSpan);
    expect(result.name).toBe('newName');
  });
  it('returns the span if the beforeSendSpan callback returns undefined', () => {
    const span = new SentrySpan({ name: 'spanName' });
    const spanJson = spanToV2JSON(span);
    const beforeSendSpan = (_span: SpanV2JSON) => {
      return undefined;
    };
    // @ts-expect-error - types don't allow undefined by design but we still test against it
    const result = applyBeforeSendSpanCallback(spanJson, beforeSendSpan);
    expect(result).toBe(spanJson);
  });
});

describe('_contextsToAttributes', () => {
  it('converts context values that are primitives to attributes', () => {
    const contexts = {
      app: { app_name: 'test', app_version: '1.0.0' },
    };
    const attributes = contextsToAttributes(contexts);
    expect(attributes).toStrictEqual({ 'app.name': 'test', 'app.version': '1.0.0' });
  });

  it('ignores non-primitive context values', () => {
    const contexts = {
      app: { app_name: 'test', app_version: '1.0.0', app_metadata: { whatever: 'whenever' } },
      someContext: { someValue: 'test', arrValue: [1, 2, 3] },
      objContext: { objValue: { a: 1, b: 2 } },
    };
    const attributes = contextsToAttributes(contexts);
    expect(attributes).toStrictEqual({ 'app.name': 'test', 'app.version': '1.0.0' });
  });

  it('ignores unknown contexts', () => {
    const contexts = {
      app: { app_name: 'test', app_version: '1.0.0' },
      unknownContext: { unknownValue: 'test' },
    };
    const attributes = contextsToAttributes(contexts);
    expect(attributes).toStrictEqual({ 'app.name': 'test', 'app.version': '1.0.0' });
  });

  it('converts explicitly mapped context values to attributes', () => {
    const contexts = {
      os: { build: '1032' },
      app: {
        app_name: 'test',
        app_version: '1.0.0',
        app_identifier: 'com.example.app',
        build_type: 'minified',
        app_memory: 1024,
        app_start_time: '2021-01-01T00:00:00Z',
      },
      culture: undefined,
      device: {
        name: undefined,
      },
      someContext: { someValue: 'test', arrValue: [1, 2, 3] },
      objContext: { objValue: { a: 1, b: 2 } },
    };
    const attributes = contextsToAttributes(contexts);
    expect(attributes).toStrictEqual({
      'os.build_id': '1032',
      'app.name': 'test',
      'app.version': '1.0.0',
      'app.identifier': 'com.example.app',
      'app.build_type': 'minified',
      'app.memory': 1024,
      'app.start_time': '2021-01-01T00:00:00Z',
    });
  });

  it("doesn't modify the original contexts object", () => {
    // tests that we actually deep-copy the individual contexts so that we can filter and delete keys as needed
    const contexts = {
      app: { app_name: 'test', app_version: '1.0.0' },
    };
    const attributes = contextsToAttributes(contexts);
    expect(attributes).toStrictEqual({ 'app.name': 'test', 'app.version': '1.0.0' });
    expect(contexts).toStrictEqual({ app: { app_name: 'test', app_version: '1.0.0' } });
  });
});
