import { describe, expect, it } from 'vitest';
import { defaultPiiToCollectionOptions } from '../../../../src/utils/data-collection/defaultPiiToCollectionOptions';

describe('defaultPiiToCollectionOptions', () => {
  it('returns permissive options when sendDefaultPii is true', () => {
    expect(defaultPiiToCollectionOptions(true)).toEqual({
      userInfo: true,
      cookies: true,
      httpHeaders: { request: true, response: true },
      httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
      queryParams: true,
      genAI: { inputs: true, outputs: true },
      stackFrameVariables: true,
      frameContextLines: 5,
    });
  });

  it('returns restrictive options when sendDefaultPii is false', () => {
    expect(defaultPiiToCollectionOptions(false)).toEqual({
      userInfo: false,
      cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      queryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: true,
      frameContextLines: 5,
    });
  });

  it('returns restrictive options when sendDefaultPii is undefined', () => {
    expect(defaultPiiToCollectionOptions(undefined)).toEqual({
      userInfo: false,
      cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      queryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: true,
      frameContextLines: 5,
    });
  });

  it('returns restrictive options when called with no arguments', () => {
    expect(defaultPiiToCollectionOptions()).toEqual({
      userInfo: false,
      cookies: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      queryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      stackFrameVariables: true,
      frameContextLines: 5,
    });
  });
});
