import type { Attachment } from '@sentry/types';
import type { h as hType } from 'preact';
import { DOCUMENT } from '../constants';
import type { Dialog, ScreenshotInput } from '../types';
import { makeScreenshotEditorComponent } from './components/ScreenshotEditor';

/**
 *
 */
export function createInput(h: typeof hType, dialog: Dialog): ScreenshotInput {
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
}
