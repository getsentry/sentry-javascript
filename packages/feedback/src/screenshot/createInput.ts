import type { Attachment, FeedbackCreateInputElement } from '@sentry/types';
import { DOCUMENT } from '../constants';
import { makeScreenshotEditorComponent } from './components/ScreenshotEditor';

/**
 *
 */
export const createInput: FeedbackCreateInputElement = (h, dialog) => {
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
};
