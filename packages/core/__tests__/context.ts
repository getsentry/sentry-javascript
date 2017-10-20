/// <reference types="jest" />
import * as Sentry from '../index';
import {MockAdapter} from '../__mocks__/MockAdapter';

const dsn = 'https://username:password@domain/path';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Client context', () => {
  test('set tags', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).toEqual({tags: {yo: 12}});
  });

  test('set extra and tags', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).toEqual({tags: {yo: 12}});
    sentry.setExtraContext({foo: 13});
    expect(sentry.getContext()).toEqual({tags: {yo: 12}, extra: {foo: 13}});
  });

  test('clear context', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).toEqual({tags: {yo: 12}});
    sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
  });

  test('set undefined', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    sentry.setTagsContext(undefined);
    expect(sentry.getContext()).toEqual({});
    sentry.setTagsContext({yo: 12});
    expect(sentry.getContext()).toEqual({tags: {yo: 12}});
    sentry.setTagsContext(undefined);
    expect(sentry.getContext()).toEqual({});
    sentry.setExtraContext(undefined);
    expect(sentry.getContext()).toEqual({});
    sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
  });

  test('set user', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    sentry.setUserContext({
      id: 'test'
    });
    expect(sentry.getContext()).toEqual({user: {id: 'test'}});
    sentry.clearContext();
    expect(sentry.getContext()).toEqual({});
  });
});
