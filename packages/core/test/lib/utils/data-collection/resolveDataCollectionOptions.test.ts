import { describe, expect, it } from 'vitest';
import { resolveDataCollectionOptions } from '../../../../src/utils/data-collection/resolveDataCollectionOptions';

describe('resolveDataCollectionOptions', () => {
  const SPEC_DEFAULTS = {
    userInfo: false,
    cookies: true,
    httpHeaders: { request: true, response: true },
    httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
    queryParams: true,
    genAI: { inputs: true, outputs: true },
    stackFrameVariables: true,
    frameContextLines: 5,
  };

  describe('with no options', () => {
    it('falls through to sendDefaultPii: undefined bridge when neither option is set', () => {
      const result = resolveDataCollectionOptions({});

      // sendDefaultPii undefined → restrictive bridge (backward compat)
      expect(result.userInfo).toBe(false);
      expect(result.httpBodies).toEqual([]);
      expect(result.genAI).toEqual({ inputs: false, outputs: false });
      expect(result.stackFrameVariables).toBe(true);
      expect(result.frameContextLines).toBe(5);
    });

    it('returns spec defaults when dataCollection is explicitly set to empty object', () => {
      expect(resolveDataCollectionOptions({ dataCollection: {} })).toEqual(SPEC_DEFAULTS);
    });

    it('collects all body types by default when dataCollection is set without httpBodies', () => {
      const result = resolveDataCollectionOptions({ dataCollection: {} });

      expect(result.httpBodies).toEqual(['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']);
    });
  });

  describe('sendDefaultPii bridge (no dataCollection)', () => {
    it('bridges sendDefaultPii: true to permissive config', () => {
      const result = resolveDataCollectionOptions({ sendDefaultPii: true });

      expect(result.userInfo).toBe(true);
      expect(result.cookies).toBe(true);
      expect(result.httpHeaders).toEqual({ request: true, response: true });
      expect(result.httpBodies).toEqual(['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']);
      expect(result.queryParams).toBe(true);
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
    });

    it('bridges sendDefaultPii: false to restrictive config', () => {
      const result = resolveDataCollectionOptions({ sendDefaultPii: false });

      expect(result.userInfo).toBe(false);
      expect(result.httpBodies).toEqual([]);
      expect(result.genAI).toEqual({ inputs: false, outputs: false });
    });
  });

  describe('dataCollection takes precedence over sendDefaultPii', () => {
    it('uses dataCollection fields when both are set', () => {
      const result = resolveDataCollectionOptions({
        sendDefaultPii: true,
        dataCollection: { userInfo: false },
      });

      // Explicit dataCollection override
      expect(result.userInfo).toBe(false);
      // Remaining fields use spec defaults (not sendDefaultPii bridge)
      expect(result.httpBodies).toEqual(['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']);
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
    });
  });

  describe('partial dataCollection overrides', () => {
    it('merges user overrides with defaults', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          userInfo: true,
          httpBodies: ['incomingRequest'],
        },
      });

      expect(result.userInfo).toBe(true);
      expect(result.httpBodies).toEqual(['incomingRequest']);
      // Everything else is spec default
      expect(result.cookies).toBe(true);
      expect(result.httpHeaders).toEqual({ request: true, response: true });
      expect(result.queryParams).toBe(true);
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
      expect(result.stackFrameVariables).toBe(true);
      expect(result.frameContextLines).toBe(5);
    });

    it('merges nested httpHeaders partially', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          httpHeaders: { request: false },
        },
      });

      expect(result.httpHeaders.request).toBe(false);
      expect(result.httpHeaders.response).toBe(true);
    });

    it('merges nested genAI partially', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          genAI: { inputs: false },
        },
      });

      expect(result.genAI.inputs).toBe(false);
      expect(result.genAI.outputs).toBe(true);
    });

    it('supports allow/deny list for cookies', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          cookies: { deny: ['x-custom'] },
        },
      });

      expect(result.cookies).toEqual({ deny: ['x-custom'] });
    });

    it('supports turning off query params', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          queryParams: false,
        },
      });

      expect(result.queryParams).toBe(false);
    });
  });

  describe('return type completeness', () => {
    it('always returns all fields', () => {
      const result = resolveDataCollectionOptions({});

      expect(Object.keys(result)).toHaveLength(8);
      expect(result).toHaveProperty('userInfo');
      expect(result).toHaveProperty('cookies');
      expect(result).toHaveProperty('httpHeaders');
      expect(result).toHaveProperty('httpHeaders.request');
      expect(result).toHaveProperty('httpHeaders.response');
      expect(result).toHaveProperty('httpBodies');
      expect(result).toHaveProperty('queryParams');
      expect(result).toHaveProperty('genAI');
      expect(result).toHaveProperty('genAI.inputs');
      expect(result).toHaveProperty('genAI.outputs');
      expect(result).toHaveProperty('stackFrameVariables');
      expect(result).toHaveProperty('frameContextLines');
    });
  });
});
