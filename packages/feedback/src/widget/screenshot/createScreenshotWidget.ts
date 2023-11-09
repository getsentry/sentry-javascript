import { WINDOW } from '@sentry/browser';
import { FeedbackComponent } from '../../types';
import { createElement } from '../util/createElement';
import { ScreenshotForm } from './form';
import { Rect, ScreenshotEditor } from './screenshotEditor';

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

export function createScreenshotWidget(): {
  ScreenshotForm: ReturnType<typeof ScreenshotForm>;
  ScreenshotDialog: ReturnType<typeof ScreenshotDialog>;
} {
  let selection: Rect | undefined;
  let screenshot: Blob | null = null;
  let screenshotCutout: Blob | null = null;
  let screenshotPreview: string = '';
  let screenshotCutoutPreview: string = '';

  function setScreenshot(newScreenshot: Blob | null): void {
    screenshot = newScreenshot;
  }
  function setScreenshotCutout(newCutout: Blob | null): void {
    screenshotCutout = newCutout;
  }
  function setScreenshotPreview(newPreviewBase64: string | null): void {
    screenshotPreview = newPreviewBase64 || '';
  }
  function setScreenshotCutoutPreview(newPreviewBase64: string | null): void {
    screenshotCutoutPreview = newPreviewBase64 || '';
  }

  function setEdit(type: 'cutout' | 'screenshot', editing: boolean) {}

  async function handleEditorSubmit(
    newScreenshot: Blob | null,
    cutout?: Blob | null,
    newSelection?: Rect,
  ): Promise<void> {
    setScreenshot(newScreenshot);
    setScreenshotCutout(cutout || null);
    setScreenshotPreview(await blobToBase64(newScreenshot));
    setScreenshotCutoutPreview((cutout && (await blobToBase64(cutout))) || '');
    selection = newSelection;
  }

  const screenshotDialog = ScreenshotDialog({
    screenshot,
    screenshotPreview,
    screenshotCutout,
    screenshotCutoutPreview,
    onSubmit: handleEditorSubmit,
  });

  const screenshotForm = ScreenshotForm({
    screenshotPreview,
    screenshotCutout,
    screenshotCutoutPreview,
    onEditCutout: () => setEdit('cutout', true),
    onEditScreenshot: () => setEdit('screenshot', true),
    onTakeScreenshot: (image: string) => {
      setScreenshotPreview(image);
    },
  });

  return {
    ScreenshotForm: screenshotForm,
    ScreenshotDialog: screenshotDialog,
  };
}

interface ScreenshotDialogProps {
  screenshot: Blob | null;
  /**
   * base64 of screenshot preview
   */
  screenshotPreview: string;
  screenshotCutout: Blob | null;
  /**
   * base64 of `screenshotCutout`
   */
  screenshotCutoutPreview: string;
  onSubmit: (screenshot: Blob | null, cutout?: Blob | null, selection?: Rect) => void;
}

function ScreenshotDialog({
  screenshot,
  screenshotPreview,
  screenshotCutoutPreview,
  onSubmit,
}: ScreenshotDialogProps): FeedbackComponent<HTMLDivElement> {
  const fragment = WINDOW.document.createDocumentFragment();

  const screenshotEditor = ScreenshotEditor({ dataUrl: screenshotPreview, onSubmit });

  const screenshotEditorWrapperEl = createElement('div', {
    className: 'screenshot-image-editor__wrapper',
    src: screenshotPreview,
    onSubmit: async newScreenshot => {
      // setScreenshot(newScreenshot);
      // setScreenshotPreview(await blobToBase64(newScreenshot));
      // setIsEditScreenshotOpen(false);
    },
    onCancel: () => {
      // setIsEditScreenshotOpen(false);
    },
  });

  const cutoutEditorEl = createElement('div', {
    className: 'screenshot-image-editor__wrapper',
    src: screenshotCutoutPreview,
    onSubmit: async newCutout => {
      // setScreenshotCutout(newCutout);
      // setScreenshotCutoutPreview(await blobToBase64(newCutout));
      // setIsEditCutoutOpen(false);
    },
    onCancel: () => {
      // setIsEditCutoutOpen(false);
    },
  });

  const el = createElement('div', {}, [
    screenshotPreview && !screenshot && screenshotEditor.el,
    screenshotEditor.el,
    cutoutEditorEl,
  ]);

  return {
    get el() {
      return el;
    },
  };
}
