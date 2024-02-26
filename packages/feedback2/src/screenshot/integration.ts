import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import type { Attachment, Integration, IntegrationClass, IntegrationFn, IntegrationFnResult } from '@sentry/types';
import type { h as hType } from 'preact';
import { DOCUMENT } from '../constants';
import type { ScreenshotWidget } from '../types';
import { makeInput } from './components/ScreenshotInput';
import { createScreenshotInputStyles } from './components/ScreenshotInput.css';
import { makeToggle } from './components/ScreenshotToggle';

interface PublicFeedback2ScreenshotIntegration {
  createWidget: (h: typeof hType) => ScreenshotWidget;
}
export type IFeedback2ScreenshotIntegration = IntegrationFnResult & PublicFeedback2ScreenshotIntegration;

export const _feedback2ScreenshotIntegration = (() => {
  return {
    name: 'Feedback2Screenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createWidget(h: typeof hType): ScreenshotWidget {
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
    },
  };
}) satisfies IntegrationFn;

export const feedback2ScreenshotIntegration = defineIntegration(_feedback2ScreenshotIntegration);

/**
 * @deprecated Use `feedback2ScreenshotIntegration()` instead
 */
// eslint-disable-next-line deprecation/deprecation
export const Feedback2Screenshot = convertIntegrationFnToClass(
  'Feedback2Screenshot',
  feedback2ScreenshotIntegration,
) as IntegrationClass<Integration & PublicFeedback2ScreenshotIntegration>;
