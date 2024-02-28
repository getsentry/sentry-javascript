import type { Attachment } from '@sentry/types';
import type { h as hType } from 'preact';
import { DOCUMENT } from '../constants';
import type { ScreenshotInput } from '../types';
import { makeInput } from './components/ScreenshotInput';

/**
 *
 */
export function createInput(h: typeof hType): ScreenshotInput {
  const canvasEl = DOCUMENT.createElement('canvas');

  return {
    input: makeInput(h, canvasEl),

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
