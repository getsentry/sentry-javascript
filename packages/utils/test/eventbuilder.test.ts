import type { Client } from '@sentry/types';

import { createStackParser, eventFromUnknownInput, nodeStackLineParser } from '../src';

const stackParser = createStackParser(nodeStackLineParser());

describe('eventFromUnknownInput', () => {
  test('object with useless props', () => {
    const event = eventFromUnknownInput({} as Client, stackParser, { foo: { bar: 'baz' }, prop: 1 });
    expect(event.exception?.values?.[0].value).toBe('Object captured as exception with keys: foo, prop');
  });

  test('object with name prop', () => {
    const event = eventFromUnknownInput({} as Client, stackParser, { foo: { bar: 'baz' }, name: 'BadType' });
    expect(event.exception?.values?.[0].value).toBe("'BadType' captured as exception");
  });

  test('object with name and message props', () => {
    const event = eventFromUnknownInput({} as Client, stackParser, { message: 'went wrong', name: 'BadType' });
    expect(event.exception?.values?.[0].value).toBe("'BadType' captured as exception with message 'went wrong'");
  });

  test('object with message prop', () => {
    const event = eventFromUnknownInput({} as Client, stackParser, { foo: { bar: 'baz' }, message: 'Some message' });
    expect(event.exception?.values?.[0].value).toBe('Some message');
  });

  test('passing client directly', () => {
    const event = eventFromUnknownInput({} as Client, stackParser, { foo: { bar: 'baz' }, prop: 1 });
    expect(event.exception?.values?.[0].value).toBe('Object captured as exception with keys: foo, prop');
  });
});
