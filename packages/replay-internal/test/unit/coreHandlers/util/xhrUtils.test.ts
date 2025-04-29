/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { _parseXhrResponse } from '../../../../src/coreHandlers/util/xhrUtils';

describe('Unit | coreHandlers | util | xhrUtils', () => {
  describe('_parseXhrResponse', () => {
    it('works with a string', () => {
      const actual = _parseXhrResponse('abc', '');
      expect(actual).toEqual(['abc']);
    });

    it('works with a Document', () => {
      const doc = document.implementation.createHTMLDocument();
      const bodyEl = document.createElement('body');
      bodyEl.innerHTML = '<div>abc</div>';
      doc.body = bodyEl;

      const actual = _parseXhrResponse(doc, '');
      expect(actual).toEqual(['<body><div>abc</div></body>']);
    });

    it('works with empty  data', () => {
      const body = undefined;
      const actual = _parseXhrResponse(body, '');
      expect(actual).toEqual([undefined]);
    });

    it('works with other type of data', () => {
      const body = {};
      const actual = _parseXhrResponse(body, '');
      expect(actual).toEqual([undefined, 'UNPARSEABLE_BODY_TYPE']);
    });

    it('works with JSON data', () => {
      const body = {};
      const actual = _parseXhrResponse(body, 'json');
      expect(actual).toEqual(['{}']);
    });
  });
});
