import * as util from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemErrorIntegration } from '../../src/integrations/systemError';

describe('systemErrorIntegration', () => {
  const originalGetSystemErrorMap = util.getSystemErrorMap;

  beforeEach(() => {
    Object.defineProperty(util, 'getSystemErrorMap', {
      value: originalGetSystemErrorMap,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(util, 'getSystemErrorMap', {
      value: originalGetSystemErrorMap,
      configurable: true,
      writable: true,
    });
  });

  function createClient(sendDefaultPii = false): any {
    return { getOptions: () => ({ sendDefaultPii }) };
  }

  function setSystemErrorMap(value: unknown): void {
    Object.defineProperty(util, 'getSystemErrorMap', {
      value,
      configurable: true,
      writable: true,
    });
  }

  it('returns the event unchanged when util.getSystemErrorMap is undefined (e.g. Bun)', () => {
    setSystemErrorMap(undefined);

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno: -2, path: '/some/path' });
    const event: any = { exception: { values: [{ value: error.message }] } };

    const result = integration.processEvent!(event, { originalException: error }, createClient());

    expect(result).toBe(event);
    expect(result.contexts?.node_system_error).toBeUndefined();
  });

  it('adds node_system_error context for a real SystemError', () => {
    const errno = -2;
    setSystemErrorMap(() => new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error("ENOENT: no such file or directory, open '/secret/path'"), {
      errno,
      path: '/secret/path',
    });
    const event: any = { exception: { values: [{ value: error.message }] } };

    const result = integration.processEvent!(event, { originalException: error }, createClient());

    expect(result.contexts?.node_system_error).toEqual({ errno });
    expect(result.exception.values[0].value).not.toContain('/secret/path');
  });

  it('keeps path in context when sendDefaultPii is true', () => {
    const errno = -2;
    setSystemErrorMap(() => new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event: any = { exception: { values: [{ value: error.message }] } };

    const result = integration.processEvent!(event, { originalException: error }, createClient(true));

    expect(result.contexts?.node_system_error).toEqual({ errno, path: '/secret/path' });
  });

  it('keeps path in context when includePaths option is true', () => {
    const errno = -2;
    setSystemErrorMap(() => new Map<number, [string, string]>([[errno, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration({ includePaths: true });
    const error = Object.assign(new Error('boom'), { errno, path: '/secret/path' });
    const event: any = { exception: { values: [{ value: error.message }] } };

    const result = integration.processEvent!(event, { originalException: error }, createClient());

    expect(result.contexts?.node_system_error).toEqual({ errno, path: '/secret/path' });
  });

  it('returns the event unchanged when the error has no errno', () => {
    setSystemErrorMap(() => new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration();
    const error = new Error('not a system error');
    const event: any = {};

    const result = integration.processEvent!(event, { originalException: error }, createClient());

    expect(result.contexts?.node_system_error).toBeUndefined();
  });

  it('returns the event unchanged when originalException is not an Error', () => {
    setSystemErrorMap(() => new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration();
    const event: any = {};

    const result = integration.processEvent!(event, { originalException: 'not an error' }, createClient());

    expect(result.contexts?.node_system_error).toBeUndefined();
  });

  it('returns the event unchanged when errno is not in the system error map', () => {
    setSystemErrorMap(() => new Map<number, [string, string]>([[-2, ['ENOENT', 'no such file or directory']]]));

    const integration = systemErrorIntegration();
    const error = Object.assign(new Error('unknown'), { errno: 99999 });
    const event: any = {};

    const result = integration.processEvent!(event, { originalException: error }, createClient());

    expect(result.contexts?.node_system_error).toBeUndefined();
  });
});
