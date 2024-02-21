import type { Breadcrumb } from '@sentry/types';

import { BASE_TIMESTAMP } from '../..';
import { ClickDetector, ignoreElement } from '../../../src/coreHandlers/handleClick';
import type { ReplayContainer } from '../../../src/types';

jest.useFakeTimers();

describe('Unit | coreHandlers | handleClick', () => {
  describe('ClickDetector', () => {
    beforeEach(() => {
      jest.setSystemTime(BASE_TIMESTAMP);
    });

    test('it captures a single click', async () => {
      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      const mockAddBreadcrumbEvent = jest.fn();

      const detector = new ClickDetector(
        replay,
        {
          threshold: 1_000,
          timeout: 3_000,
          scrollTimeout: 200,
          ignoreSelector: '',
        },
        mockAddBreadcrumbEvent,
      );

      const breadcrumb: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 1,
        },
      };
      const node = document.createElement('button');
      detector.handleClick(breadcrumb, node);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumbEvent).toHaveBeenCalledWith(replay, {
        category: 'ui.slowClickDetected',
        type: 'default',
        data: {
          clickCount: 1,
          endReason: 'timeout',
          nodeId: 1,
          route: 'test-route',
          timeAfterClickMs: 3000,
          url: 'http://localhost/',
        },
        message: undefined,
        timestamp: expect.any(Number),
      });

      jest.advanceTimersByTime(5_000);
      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
    });

    test('it captures multiple clicks', async () => {
      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      const mockAddBreadcrumbEvent = jest.fn();

      const detector = new ClickDetector(
        replay,
        {
          threshold: 1_000,
          timeout: 3_000,
          scrollTimeout: 200,
          ignoreSelector: '',
        },
        mockAddBreadcrumbEvent,
      );

      const breadcrumb1: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 1,
        },
      };
      const breadcrumb2: Breadcrumb = {
        timestamp: (BASE_TIMESTAMP + 200) / 1000,
        data: {
          nodeId: 1,
        },
      };
      const breadcrumb3: Breadcrumb = {
        timestamp: (BASE_TIMESTAMP + 1200) / 1000,
        data: {
          nodeId: 1,
        },
      };
      const node = document.createElement('button');
      detector.handleClick(breadcrumb1, node);
      detector.handleClick(breadcrumb2, node);
      detector.handleClick(breadcrumb3, node);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(1_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
      expect(mockAddBreadcrumbEvent).toHaveBeenCalledWith(replay, {
        category: 'ui.slowClickDetected',
        type: 'default',
        data: {
          clickCount: 1,
          endReason: 'timeout',
          nodeId: 1,
          route: 'test-route',
          timeAfterClickMs: 3000,
          url: 'http://localhost/',
        },
        message: undefined,
        timestamp: BASE_TIMESTAMP / 1000,
      });

      jest.advanceTimersByTime(2_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(2);
      expect(mockAddBreadcrumbEvent).toHaveBeenLastCalledWith(replay, {
        category: 'ui.slowClickDetected',
        type: 'default',
        data: {
          clickCount: 1,
          endReason: 'timeout',
          nodeId: 1,
          route: 'test-route',
          timeAfterClickMs: 3000,
          url: 'http://localhost/',
        },
        message: undefined,
        timestamp: (BASE_TIMESTAMP + 1200) / 1000,
      });

      jest.advanceTimersByTime(5_000);
      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(2);
    });

    test('it captures clicks on different elements', async () => {
      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      const mockAddBreadcrumbEvent = jest.fn();

      const detector = new ClickDetector(
        replay,
        {
          threshold: 1_000,
          timeout: 3_000,
          scrollTimeout: 200,
          ignoreSelector: '',
        },
        mockAddBreadcrumbEvent,
      );

      const breadcrumb1: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 1,
        },
      };
      const breadcrumb2: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 2,
        },
      };
      const breadcrumb3: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 3,
        },
      };
      const node1 = document.createElement('button');
      const node2 = document.createElement('button');
      const node3 = document.createElement('button');
      detector.handleClick(breadcrumb1, node1);
      detector.handleClick(breadcrumb2, node2);
      detector.handleClick(breadcrumb3, node3);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(3_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(3);

      jest.advanceTimersByTime(5_000);
      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(3);
    });

    test('it ignores clicks on ignored elements', async () => {
      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      const mockAddBreadcrumbEvent = jest.fn();

      const detector = new ClickDetector(
        replay,
        {
          threshold: 1_000,
          timeout: 3_000,
          scrollTimeout: 200,
          ignoreSelector: '',
        },
        mockAddBreadcrumbEvent,
      );

      const breadcrumb1: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 1,
        },
      };
      const breadcrumb2: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 2,
        },
      };
      const breadcrumb3: Breadcrumb = {
        timestamp: BASE_TIMESTAMP / 1000,
        data: {
          nodeId: 3,
        },
      };
      const node1 = document.createElement('div');
      const node2 = document.createElement('div');
      const node3 = document.createElement('div');
      detector.handleClick(breadcrumb1, node1);
      detector.handleClick(breadcrumb2, node2);
      detector.handleClick(breadcrumb3, node3);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

      jest.advanceTimersByTime(3_000);

      expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);
    });

    describe('mutations', () => {
      let detector: ClickDetector;
      let mockAddBreadcrumbEvent = jest.fn();

      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      beforeEach(() => {
        jest.setSystemTime(BASE_TIMESTAMP);

        mockAddBreadcrumbEvent = jest.fn();

        detector = new ClickDetector(
          replay,
          {
            threshold: 1_000,
            timeout: 3_000,
            scrollTimeout: 200,
            ignoreSelector: '',
          },
          mockAddBreadcrumbEvent,
        );
      });

      test('it does not consider clicks with mutation before threshold as slow click', async () => {
        const breadcrumb: Breadcrumb = {
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            nodeId: 1,
          },
        };
        const node = document.createElement('button');
        detector.handleClick(breadcrumb, node);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(500);

        // Pretend a mutation happend
        detector['_lastMutation'] = BASE_TIMESTAMP / 1000 + 0.5;

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(3_000);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);
      });

      test('it considers clicks with mutation after threshold as slow click', async () => {
        const breadcrumb: Breadcrumb = {
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            nodeId: 1,
          },
        };
        const node = document.createElement('button');
        detector.handleClick(breadcrumb, node);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(1_000);

        // Pretend a mutation happend
        detector['_lastMutation'] = BASE_TIMESTAMP / 1000 + 2;

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(3_000);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledWith(replay, {
          category: 'ui.slowClickDetected',
          type: 'default',
          data: {
            clickCount: 1,
            endReason: 'mutation',
            nodeId: 1,
            route: 'test-route',
            timeAfterClickMs: 2000,
            url: 'http://localhost/',
          },
          message: undefined,
          timestamp: expect.any(Number),
        });

        jest.advanceTimersByTime(5_000);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
      });

      test('it caps timeout', async () => {
        const breadcrumb: Breadcrumb = {
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            nodeId: 1,
          },
        };
        const node = document.createElement('button');
        detector.handleClick(breadcrumb, node);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(1_000);

        // Pretend a mutation happend
        detector['_lastMutation'] = BASE_TIMESTAMP / 1000 + 5;

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(5_000);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledWith(replay, {
          category: 'ui.slowClickDetected',
          type: 'default',
          data: {
            clickCount: 1,
            endReason: 'timeout',
            nodeId: 1,
            route: 'test-route',
            timeAfterClickMs: 3000,
            url: 'http://localhost/',
          },
          message: undefined,
          timestamp: expect.any(Number),
        });

        jest.advanceTimersByTime(5_000);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
      });
    });

    describe('scroll', () => {
      let detector: ClickDetector;
      let mockAddBreadcrumbEvent = jest.fn();

      const replay = {
        getCurrentRoute: () => 'test-route',
      } as ReplayContainer;

      beforeEach(() => {
        jest.setSystemTime(BASE_TIMESTAMP);

        mockAddBreadcrumbEvent = jest.fn();

        detector = new ClickDetector(
          replay,
          {
            threshold: 1_000,
            timeout: 3_000,
            scrollTimeout: 200,
            ignoreSelector: '',
          },
          mockAddBreadcrumbEvent,
        );
      });

      test('it does not consider clicks with scroll before threshold as slow click', async () => {
        const breadcrumb: Breadcrumb = {
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            nodeId: 1,
          },
        };
        const node = document.createElement('button');
        detector.handleClick(breadcrumb, node);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(100);

        // Pretend a mutation happend
        detector['_lastScroll'] = BASE_TIMESTAMP / 1000 + 0.15;

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(3_000);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);
      });

      test('it considers clicks with scroll after threshold as slow click', async () => {
        const breadcrumb: Breadcrumb = {
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            nodeId: 1,
          },
        };
        const node = document.createElement('button');
        detector.handleClick(breadcrumb, node);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(300);

        // Pretend a mutation happend
        detector['_lastScroll'] = BASE_TIMESTAMP / 1000 + 0.3;

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(0);

        jest.advanceTimersByTime(3_000);

        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledWith(replay, {
          category: 'ui.slowClickDetected',
          type: 'default',
          data: {
            clickCount: 1,
            endReason: 'timeout',
            nodeId: 1,
            route: 'test-route',
            timeAfterClickMs: 3000,
            url: 'http://localhost/',
          },
          message: undefined,
          timestamp: expect.any(Number),
        });

        jest.advanceTimersByTime(5_000);
        expect(mockAddBreadcrumbEvent).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('ignoreElement', () => {
    it.each([
      ['div', {}, true],
      ['button', {}, false],
      ['a', {}, false],
      ['input', {}, true],
      ['input', { type: 'text' }, true],
      ['input', { type: 'button' }, false],
      ['input', { type: 'submit' }, false],
      ['a', { target: '_self' }, false],
      ['a', { target: '_blank' }, true],
      ['a', { download: '' }, true],
      ['a', { href: 'xx' }, false],
    ])('it works with <%s> & %p', (tagName, attributes, expected) => {
      const node = document.createElement(tagName);
      Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, value);
      });
      expect(ignoreElement(node, '')).toBe(expected);
    });

    test('it ignored selectors matching ignoreSelector', () => {
      const button = document.createElement('button');
      const a = document.createElement('a');

      expect(ignoreElement(button, 'button')).toBe(true);
      expect(ignoreElement(a, 'button')).toBe(false);
    });
  });
});
