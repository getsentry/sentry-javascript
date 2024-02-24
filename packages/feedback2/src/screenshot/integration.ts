import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import type { ComponentType, h as hType } from 'preact';
import { DOCUMENT } from '../constants';
import { makeInput } from './components/ScreenshotInput';
import type { Props as ScreenshotInputProps } from './components/ScreenshotInput';
import { makeToggle } from './components/ScreenshotToggle';
import type { Props as ScreenshotToggleProps } from './components/ScreenshotToggle';

export const feedback2ScreenshotIntegration = (() => {
  // eslint-disable-next-line deprecation/deprecation
  return new Feedback2Screenshot();
}) satisfies IntegrationFn;

/**
 * TODO
 *
 * @deprecated Use `feedback2ScreenshotIntegration()` instead.
 */
export class Feedback2Screenshot implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback2Screenshot';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor() {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Feedback2Screenshot.id;
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }
    // Nothing?
  }

  /**
   *
   */
  public createWidget(h: typeof hType): ScreenshotWidget {
    const canvasEl = DOCUMENT.createElement('canvas');
    return {
      input: makeInput(h, canvasEl),
      toggle: makeToggle(h),
      value: () => {
        // TODO: maybe this only returns if the canvas is in the document?
        // then handleFormData can be moved into this integration!
        return canvasToBlob(canvasEl);
      },
    };
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(resolve);
  });
}

export interface ScreenshotWidget {
  input: ComponentType<ScreenshotInputProps>;
  toggle: ComponentType<ScreenshotToggleProps>;
  value: () => Promise<Blob | null>;
}
