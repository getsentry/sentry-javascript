import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { CanvasManagerInterface, CanvasManagerOptions } from '@sentry-internal/replay';
import { CanvasManager } from '@sentry-internal/rrweb';

interface SnapshotOptions {
  skipRequestAnimationFrame?: boolean;
}

interface ReplayCanvasIntegration extends Integration {
  snapshot: (canvasElement?: HTMLCanvasElement, options?: SnapshotOptions) => Promise<void>;
}

interface ReplayCanvasOptions {
  enableManualSnapshot?: boolean;
  maxCanvasSize?: [width: number, height: number];
  quality: 'low' | 'medium' | 'high';
}

type GetCanvasManager = (options: CanvasManagerOptions) => CanvasManagerInterface;
export interface ReplayCanvasIntegrationOptions {
  enableManualSnapshot?: boolean;
  maxCanvasSize?: number;
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
const DEFAULT_MAX_CANVAS_SIZE = 1280;

/** Exported only for type safe tests. */
export const _replayCanvasIntegration = ((options: Partial<ReplayCanvasOptions> = {}) => {
  const [maxCanvasWidth, maxCanvasHeight] = options.maxCanvasSize || [];
  const _canvasOptions = {
    quality: options.quality || 'medium',
    enableManualSnapshot: options.enableManualSnapshot,
    maxCanvasSize: [
      maxCanvasWidth ? Math.min(maxCanvasWidth, DEFAULT_MAX_CANVAS_SIZE) : DEFAULT_MAX_CANVAS_SIZE,
      maxCanvasHeight ? Math.min(maxCanvasHeight, DEFAULT_MAX_CANVAS_SIZE) : DEFAULT_MAX_CANVAS_SIZE,
    ] as [number, number],
  };

  let currentCanvasManager: CanvasManager | undefined;
  let canvasManagerResolve: (value: CanvasManager) => void;
  const _canvasManager: Promise<CanvasManager> = new Promise(resolve => (canvasManagerResolve = resolve));

  return {
    name: INTEGRATION_NAME,
    getOptions(): ReplayCanvasIntegrationOptions {
      const { quality, enableManualSnapshot, maxCanvasSize } = _canvasOptions;

      return {
        enableManualSnapshot,
        recordCanvas: true,
        getCanvasManager: (getCanvasManagerOptions: CanvasManagerOptions) => {
          const manager = new CanvasManager({
            ...getCanvasManagerOptions,
            enableManualSnapshot,
            maxCanvasSize,
            errorHandler: (err: unknown) => {
              try {
                if (typeof err === 'object') {
                  (err as Error & { __rrweb__?: boolean }).__rrweb__ = true;
                }
              } catch {
                // ignore errors here
                // this can happen if the error is frozen or does not allow mutation for other reasons
              }
            },
          });

          currentCanvasManager = manager;

          // Resolve promise on first call for backward compatibility
          canvasManagerResolve(manager);

          return manager;
        },
        ...(CANVAS_QUALITY[quality || 'medium'] || CANVAS_QUALITY.medium),
      };
    },
    async snapshot(canvasElement?: HTMLCanvasElement, options?: SnapshotOptions) {
      const canvasManager = currentCanvasManager || (await _canvasManager);

      canvasManager.snapshot(canvasElement, options);
    },
  };
}) satisfies IntegrationFn<ReplayCanvasIntegration>;

/**
 * Add this in addition to `replayIntegration()` to enable canvas recording.
 */
export const replayCanvasIntegration = defineIntegration(
  _replayCanvasIntegration,
) as IntegrationFn<ReplayCanvasIntegration>;
