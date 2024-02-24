import type { Attachment, Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';
import type { ComponentType, h as hType } from 'preact';
import { DOCUMENT } from '../constants';
import { makeInput } from './components/ScreenshotInput';
import type { Props as ScreenshotInputProps } from './components/ScreenshotInput';
import { createScreenshotInputStyles } from './components/ScreenshotInput.css';
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
   * Setupand initialize feedback container
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
      style: createScreenshotInputStyles(),
      input: makeInput(h, canvasEl),
      toggle: makeToggle(h),
      value: async () => {
        const blob = await new Promise<Parameters<BlobCallback>[0]>(resolve => {
          canvasEl.toBlob(resolve, 'image/png');
        });
        if (blob) {
          const data = new Uint8Array(await blob.arrayBuffer());
          const attachment: Attachment = {
            data,
            filename: 'screenshot.png',
            contentType: 'application/png',
            // attachmentType?: string;
          };
          return attachment;
        }
        return;
      },
    };
  }
}

export interface ScreenshotWidget {
  style: HTMLStyleElement;
  input: ComponentType<ScreenshotInputProps>;
  toggle: ComponentType<ScreenshotToggleProps>;
  value: () => Promise<Attachment | undefined>;
}
