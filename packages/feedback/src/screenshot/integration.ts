import type { FeedbackScreenshotIntegration, IntegrationFn } from '@sentry/types';
import type { Attachment } from '@sentry/types';
import { DOCUMENT } from '../constants';
import { makeScreenshotEditorComponent } from './components/ScreenshotEditor';

export const feedbackScreenshotIntegration = ((): FeedbackScreenshotIntegration => {
  return {
    name: 'FeedbackScreenshot',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    setupOnce() {},
    createInput: (h, dialog) => {
      const imageBuffer = DOCUMENT.createElement('canvas');

      return {
        input: makeScreenshotEditorComponent({ h, imageBuffer, dialog }),

        value: async () => {
          const blob = await new Promise<Parameters<BlobCallback>[0]>(resolve => {
            imageBuffer.toBlob(resolve, 'image/png');
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
