import { WINDOW } from '@sentry/browser';

import type { Screenshot } from '../../types';
import { createElement } from '../util/createElement';
import { ScreenshotForm } from './Form';
import { createScreenshotStyles } from './Screenshot.css';
import { ScreenshotAnnotator } from './ScreenshotAnnotator';
import type { Rect } from './ScreenshotEditor';
import { ScreenshotEditor } from './ScreenshotEditor';

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const blobData = await blob.arrayBuffer();
  return new Uint8Array(blobData);
}

function blobToBase64(blob: Blob | null): Promise<string> {
  return new Promise<string>((resolve, _) => {
    if (!blob) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 *
 */
export function createScreenshotWidget(): {
  dialogEl: HTMLDivElement;
  formEl: HTMLDivElement | null;
  ScreenshotForm: ReturnType<typeof ScreenshotForm>;
  ScreenshotStyles: ReturnType<typeof createScreenshotStyles>;
  // processScreenshot: (scope: Scope) => void;
  getData: () => Promise<Screenshot[]>;
} {
  let selection: Rect | undefined;
  let screenshot: Blob | null = null;
  let screenshotCutout: Blob | null = null;
  let screenshotPreview: string = '';
  let screenshotCutoutPreview: string = '';

  /**
   *
   */
  function setScreenshot(newScreenshot: Blob | null): void {
    screenshot = newScreenshot;
  }
  /**
   *
   */
  function setScreenshotCutout(newCutout: Blob | null): void {
    screenshotCutout = newCutout;
  }
  /**
   *
   */
  function setScreenshotPreview(newPreviewBase64: string | null): void {
    screenshotPreview = newPreviewBase64 || '';
  }
  /**
   *
   */
  function setScreenshotCutoutPreview(newPreviewBase64: string | null): void {
    screenshotCutoutPreview = newPreviewBase64 || '';
  }

  /**
   *
   */
  function setEdit(type: 'cutout' | 'screenshot', editing: boolean): void {
    const target = type === 'cutout' ? cutoutAnnotator : screenshotAnnotator;
    if (editing) {
      const src = type === 'cutout' ? screenshotCutoutPreview : screenshotPreview;
      target.show(src);
    } else {
      target.hide();
    }
  }

  /**
   *
   */
  async function handleEditorSubmit(
    newScreenshot: Blob | null,
    newCutout?: Blob | null,
    newSelection?: Rect,
  ): Promise<void> {
    setScreenshot(newScreenshot);
    setScreenshotCutout(newCutout || null);
    setScreenshotPreview(await blobToBase64(newScreenshot));
    setScreenshotCutoutPreview((newCutout && (await blobToBase64(newCutout))) || '');
    screenshotForm.setFormPreview(await blobToBase64(newScreenshot));
    screenshotForm.setFormCutoutPreview((newCutout && (await blobToBase64(newCutout))) || '');
    selection = newSelection;

    screenshotEditor.hide();
  }

  const screenshotEditor = ScreenshotEditor({ onSubmit: handleEditorSubmit });

  const screenshotForm = ScreenshotForm({
    onEditCutout: () => setEdit('cutout', true),
    onEditScreenshot: () => setEdit('screenshot', true),
    onTakeScreenshot: (image: string) => {
      setScreenshotPreview(image);
      screenshotEditor.show(image);
    },
  });

  const screenshotAnnotator = ScreenshotAnnotator({
    onSubmit: async newScreenshot => {
      setScreenshot(newScreenshot);
      setScreenshotPreview(await blobToBase64(newScreenshot));
      screenshotForm.setFormPreview(await blobToBase64(newScreenshot));
      setEdit('screenshot', false);
    },
    onCancel: () => {
      setEdit('screenshot', false);
      // setIsEditScreenshotOpen(false);
    },
  });

  const cutoutAnnotator = ScreenshotAnnotator({
    onSubmit: async newCutout => {
      setScreenshotCutout(newCutout);
      setScreenshotCutoutPreview(await blobToBase64(newCutout));
      screenshotForm.setFormCutoutPreview((newCutout && (await blobToBase64(newCutout))) || '');
      setEdit('cutout', false);
    },
    onCancel: () => {
      setEdit('cutout', false);
    },
  });

  const dialogEl = createElement('div', {}, [
    screenshotPreview && !screenshot && screenshotEditor.el,
    screenshotEditor.el,
    screenshotAnnotator.el,
    cutoutAnnotator.el,
  ]);

  return {
    dialogEl,
    formEl: screenshotForm.el,
    ScreenshotForm: screenshotForm,
    ScreenshotStyles: createScreenshotStyles(WINDOW.document),
    // processScreenshot: async (scope: Scope) => {
    //
    //   if (imageData) {
    //     scope.addAttachment();
    //     console.log('adding attachments to scope');
    //   }
    //
    //   if (imageCutoutData) {
    //     scope.addAttachment();
    //     console.log('adding attachments to scope');
    //   }
    // },
    async getData() {
      const imageData = screenshot && (await blobToUint8Array(screenshot));
      const imageCutoutData = screenshotCutout && (await blobToUint8Array(screenshotCutout));
      const data = [];
      if (imageData) {
        data.push({
          filename: 'screenshot.png',
          data: imageData,
          contentType: 'image/png',
        });
      }
      if (imageCutoutData) {
        data.push({
          filename: 'screenshot-cutout.png',
          data: imageCutoutData,
          contentType: 'image/png',
        });
      }
      return data;
    },
  };
}
