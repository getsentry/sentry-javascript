import { h, render } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { useTakeScreenshot } from './useTakeScreenshot';
import type { VNode } from 'preact';
import { ScreenshotWidget } from './screenshotEditor';

type Props = {
  croppingRef: HTMLDivElement;
  screenshotImage: HTMLCanvasElement | null;
  setScreenshotImage: (screenshot: HTMLCanvasElement | null) => void;
};

export function ScreenshotButton({ croppingRef, screenshotImage, setScreenshotImage }: Props): VNode {
  const [clicked, setClicked] = useState(false);
  const { isInProgress, takeScreenshot } = useTakeScreenshot();

  const handleClick = useCallback(async () => {
    if (!clicked) {
      const image = await takeScreenshot();
      setScreenshotImage(image);
      render(<ScreenshotWidget screenshotImage={image} setScreenshotImage={setScreenshotImage} />, croppingRef);
    } else {
      setScreenshotImage(null);
      render(null, croppingRef);
    }
    setClicked(prev => !prev);
  }, [clicked]);

  return (
    <label htmlFor="screenshot" className="form__label">
      <span className="form__label__text">Screenshot</span>
      <button class="btn btn--default" type="button" onClick={handleClick}>
        {clicked ? 'Remove' : 'Add'}
      </button>
    </label>
  );
}
