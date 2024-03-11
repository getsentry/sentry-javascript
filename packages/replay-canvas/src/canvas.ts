import { CanvasManager } from '@sentry-internal/rrweb';
import { defineIntegration } from '@sentry/core';
import type { CanvasManagerInterface, CanvasManagerOptions } from '@sentry/replay';
import type { IntegrationFn } from '@sentry/types';

interface ReplayCanvasOptions {
  enableManualSnapshot?: boolean;
  quality: 'low' | 'medium' | 'high';
}

type GetCanvasManager = (options: CanvasManagerOptions) => CanvasManagerInterface;
export interface ReplayCanvasIntegrationOptions {
  enableManualSnapshot?: boolean;
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

/** Exported only for type safe tests. */
export const _replayCanvasIntegration = ((options: Partial<ReplayCanvasOptions> = {}) => {
  const _canvasOptions = {
    quality: options.quality || 'medium',
    enableManualSnapshot: options.enableManualSnapshot,
  };

  let canvasManagerResolve: (value: CanvasManager) => void;
  const _canvasManager: Promise<CanvasManager> = new Promise(resolve => (canvasManagerResolve = resolve));

  return {
    name: INTEGRATION_NAME,
    getOptions(): ReplayCanvasIntegrationOptions {
      const { quality, enableManualSnapshot } = _canvasOptions;

      return {
        enableManualSnapshot,
        recordCanvas: true,
        getCanvasManager: (options: CanvasManagerOptions) => {
          const manager = new CanvasManager({
            ...options,
            enableManualSnapshot,
            errorHandler: (err: unknown) => {
              try {
                if (typeof err === 'object') {
                  (err as Error & { __rrweb__?: boolean }).__rrweb__ = true;
                }
              } catch (error) {
                // ignore errors here
                // this can happen if the error is frozen or does not allow mutation for other reasons
              }
            },
          });
          canvasManagerResolve(manager);
          return manager;
        },
        ...(CANVAS_QUALITY[quality || 'medium'] || CANVAS_QUALITY.medium),
      };
    },
    async snapshot(canvasElement?: HTMLCanvasElement) {
      const canvasManager = await _canvasManager;
      canvasManager.snapshot(canvasElement);
    },
  };
}) satisfies IntegrationFn;

/**
 * Add this in addition to `replayIntegration()` to enable canvas recording.
 */
export const replayCanvasIntegration = defineIntegration(_replayCanvasIntegration);
