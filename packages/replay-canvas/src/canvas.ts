import { CanvasManager } from '@sentry-internal/rrweb';
import { convertIntegrationFnToClass } from '@sentry/core';
import type { CanvasManagerInterface, CanvasManagerOptions } from '@sentry/replay';
import type { Integration, IntegrationClass, IntegrationFn } from '@sentry/types';

interface ReplayCanvasOptions {
  quality: 'low' | 'medium' | 'high';
}

type GetCanvasManager = (options: CanvasManagerOptions) => CanvasManagerInterface;
export interface ReplayCanvasIntegrationOptions {
  recordCanvas: true;
  getCanvasManager: GetCanvasManager;
  sampling: {
    canvas: number;
  };
  dataURLOptions: {
    type: string;
    quality: number;
  };
}

const CANVAS_QUALITY = {
  low: {
    sampling: {
      canvas: 1,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.25,
    },
  },
  medium: {
    sampling: {
      canvas: 2,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.4,
    },
  },
  high: {
    sampling: {
      canvas: 4,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.5,
    },
  },
};

const INTEGRATION_NAME = 'ReplayCanvas';

/**
 * An integration to add canvas recording to replay.
 */
const replayCanvasIntegration = ((options: Partial<ReplayCanvasOptions> = {}) => {
  const _canvasOptions = {
    quality: options.quality || 'medium',
  };

  return {
    name: INTEGRATION_NAME,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    getOptions(): ReplayCanvasIntegrationOptions {
      const { quality } = _canvasOptions;

      return {
        recordCanvas: true,
        getCanvasManager: (options: CanvasManagerOptions) => new CanvasManager(options),
        ...(CANVAS_QUALITY[quality || 'medium'] || CANVAS_QUALITY.medium),
      };
    },
  };
}) satisfies IntegrationFn;

// TODO(v8)
// eslint-disable-next-line deprecation/deprecation
export const ReplayCanvas = convertIntegrationFnToClass(INTEGRATION_NAME, replayCanvasIntegration) as IntegrationClass<
  Integration & {
    getOptions: () => ReplayCanvasIntegrationOptions;
  }
>;
