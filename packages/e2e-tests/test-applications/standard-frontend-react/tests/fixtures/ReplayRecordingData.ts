import { expect } from '@playwright/test';

export const ReplayRecordingData = [
  [
    { type: 4, data: { href: 'http://localhost:3000/', width: 1280, height: 720 }, timestamp: expect.any(Number) },
    {
      type: 2,
      data: {
        node: {
          type: 0,
          childNodes: [
            { type: 1, name: 'html', publicId: '', systemId: '', id: 2 },
            {
              type: 2,
              tagName: 'html',
              attributes: { lang: 'en' },
              childNodes: [
                {
                  type: 2,
                  tagName: 'head',
                  attributes: {},
                  childNodes: [
                    { type: 2, tagName: 'meta', attributes: { charset: 'utf-8' }, childNodes: [], id: 5 },
                    {
                      type: 2,
                      tagName: 'meta',
                      attributes: { name: 'viewport', content: 'width=device-width,initial-scale=1' },
                      childNodes: [],
                      id: 6,
                    },
                    {
                      type: 2,
                      tagName: 'meta',
                      attributes: { name: 'theme-color', content: '#expect.any(Number)' },
                      childNodes: [],
                      id: 7,
                    },
                    {
                      type: 2,
                      tagName: 'title',
                      attributes: {},
                      childNodes: [{ type: 3, textContent: '***** ***', id: 9 }],
                      id: 8,
                    },
                  ],
                  id: 4,
                },
                {
                  type: 2,
                  tagName: 'body',
                  attributes: {},
                  childNodes: [
                    {
                      type: 2,
                      tagName: 'noscript',
                      attributes: {},
                      childNodes: [{ type: 3, textContent: '*** **** ** ****** ********** ** *** **** ****', id: 12 }],
                      id: 11,
                    },
                    { type: 2, tagName: 'div', attributes: { id: 'root' }, childNodes: [], id: 13 },
                  ],
                  id: 10,
                },
              ],
              id: 3,
            },
          ],
          id: 1,
        },
        initialOffset: { left: 0, top: 0 },
      },
      timestamp: expect.any(Number),
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'memory',
          description: 'memory',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          data: {
            memory: {
              jsHeapSizeLimit: expect.any(Number),
              totalJSHeapSize: expect.any(Number),
              usedJSHeapSize: expect.any(Number),
            },
          },
        },
      },
    },
    {
      type: 3,
      data: {
        source: 0,
        texts: [],
        attributes: [],
        removes: [],
        adds: [
          {
            parentId: 13,
            nextId: null,
            node: {
              type: 2,
              tagName: 'a',
              attributes: { id: 'navigation', href: 'http://localhost:3000/user/5' },
              childNodes: [],
              id: 14,
            },
          },
          { parentId: 14, nextId: null, node: { type: 3, textContent: '********', id: 15 } },
          {
            parentId: 13,
            nextId: 14,
            node: {
              type: 2,
              tagName: 'input',
              attributes: { type: 'button', id: 'exception-button', value: '******* *********' },
              childNodes: [],
              id: 16,
            },
          },
        ],
      },
      timestamp: expect.any(Number),
    },
    {
      type: 3,
      data: { source: 5, text: 'Capture Exception', isChecked: false, id: 16 },
      timestamp: expect.any(Number),
    },
  ],
  [
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'navigation.navigate',
          description: 'http://localhost:3000/',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          data: { size: expect.any(Number), duration: expect.any(Number) },
        },
      },
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'resource.script',
          description: 'http://localhost:3000/static/js/main.2517f1d8.js',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          data: { size: expect.any(Number), encodedBodySize: expect.any(Number) },
        },
      },
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'largest-contentful-paint',
          description: 'largest-contentful-paint',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          data: { value: expect.any(Number), size: expect.any(Number), nodeId: 16 },
        },
      },
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'paint',
          description: 'first-paint',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
        },
      },
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'paint',
          description: 'first-contentful-paint',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
        },
      },
    },
    {
      type: 5,
      timestamp: expect.any(Number),
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'memory',
          description: 'memory',
          startTimestamp: expect.any(Number),
          endTimestamp: expect.any(Number),
          data: {
            memory: {
              jsHeapSizeLimit: expect.any(Number),
              totalJSHeapSize: expect.any(Number),
              usedJSHeapSize: expect.any(Number),
            },
          },
        },
      },
    },
  ],
];
