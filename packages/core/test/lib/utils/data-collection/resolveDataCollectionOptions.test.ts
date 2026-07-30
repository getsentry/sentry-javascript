import { describe, expect, it } from 'vitest';
import { resolveDataCollectionOptions } from '../../../../src/utils/data-collection/resolveDataCollectionOptions';

describe('resolveDataCollectionOptions', () => {
  const SPEC_DEFAULTS = {
    userInfo: true,
    cookies: true,
    httpHeaders: { request: true, response: true },
    httpBodies: ['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse'],
    urlQueryParams: true,
    graphQL: { document: true, variables: true },
    genAI: { inputs: true, outputs: true },
    databaseQueryData: true,
    stackFrameVariables: true,
    frameContextLines: 5,
  };

  describe('with no options', () => {
    it('falls through to sendDefaultPii: undefined bridge when neither option is set', () => {
      const result = resolveDataCollectionOptions({});

      // sendDefaultPii undefined → restrictive bridge (backward compat; userInfo defaults to true only when dataCollection is set)
      expect(result.userInfo).toBe(false);
      expect(result.httpBodies).toEqual(['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']);
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
      // GraphQL documents are redacted at collection time, so they stay on to preserve legacy behavior.
      expect(result.graphQL).toEqual({ document: true, variables: true });
      expect(result.databaseQueryData).toBe(false);
      expect(result.stackFrameVariables).toBe(true);
      expect(result.frameContextLines).toBe(7);
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
      expect(result.urlQueryParams).toBe(true);
      expect(result.graphQL).toEqual({ document: true, variables: true });
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
      expect(result.databaseQueryData).toBe(true);
    });

    it('bridges sendDefaultPii: false to restrictive config', () => {
      const result = resolveDataCollectionOptions({ sendDefaultPii: false });

      expect(result.userInfo).toBe(false);
      expect(result.httpBodies).toEqual(['incomingRequest', 'outgoingRequest', 'incomingResponse', 'outgoingResponse']);
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
      expect(result.graphQL).toEqual({ document: true, variables: true });
      expect(result.databaseQueryData).toBe(false);
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
      expect(result.databaseQueryData).toBe(true);
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
      expect(result.urlQueryParams).toBe(true);
      expect(result.graphQL).toEqual({ document: true, variables: true });
      expect(result.genAI).toEqual({ inputs: true, outputs: true });
      expect(result.databaseQueryData).toBe(true);
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

    it('merges nested graphQL partially', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          graphQL: { document: false },
        },
      });

      expect(result.graphQL.document).toBe(false);
      expect(result.graphQL.variables).toBe(true);
    });

    it('supports allow/deny list for cookies', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          cookies: { deny: ['x-custom'] },
        },
      });

      expect(result.cookies).toEqual({ deny: ['x-custom'] });
    });

    it('supports turning off URL query params', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          urlQueryParams: false,
        },
      });

      expect(result.urlQueryParams).toBe(false);
    });

    it('supports turning off database query data', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          databaseQueryData: false,
        },
      });

      expect(result.databaseQueryData).toBe(false);
    });

    it('supports allow/deny list for stack frame variables', () => {
      expect(
        resolveDataCollectionOptions({ dataCollection: { stackFrameVariables: { allow: ['user'] } } })
          .stackFrameVariables,
      ).toEqual({ allow: ['user'] });

      expect(
        resolveDataCollectionOptions({ dataCollection: { stackFrameVariables: { deny: ['password'] } } })
          .stackFrameVariables,
      ).toEqual({ deny: ['password'] });
    });

    it('supports turning off stack frame variables', () => {
      const result = resolveDataCollectionOptions({
        dataCollection: {
          stackFrameVariables: false,
        },
      });

      expect(result.stackFrameVariables).toBe(false);
    });
  });

  describe('return type completeness', () => {
    it('always returns all fields', () => {
      const result = resolveDataCollectionOptions({});

      expect(Object.keys(result)).toHaveLength(10);
      expect(result).toHaveProperty('userInfo');
      expect(result).toHaveProperty('cookies');
      expect(result).toHaveProperty('httpHeaders');
      expect(result).toHaveProperty('httpHeaders.request');
      expect(result).toHaveProperty('httpHeaders.response');
      expect(result).toHaveProperty('httpBodies');
      expect(result).toHaveProperty('urlQueryParams');
      expect(result).toHaveProperty('graphQL');
      expect(result).toHaveProperty('graphQL.document');
      expect(result).toHaveProperty('graphQL.variables');
      expect(result).toHaveProperty('genAI');
      expect(result).toHaveProperty('genAI.inputs');
      expect(result).toHaveProperty('genAI.outputs');
      expect(result).toHaveProperty('databaseQueryData');
      expect(result).toHaveProperty('stackFrameVariables');
      expect(result).toHaveProperty('frameContextLines');
    });
  });
});
