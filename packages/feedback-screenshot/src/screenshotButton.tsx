import { h, render } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { useTakeScreenshot } from './useTakeScreenshot';
import type { VNode } from 'preact';
import { ScreenshotWidget } from './screenshotWidget';

type Props = { croppingRef: HTMLDivElement };

export function ScreenshotButton({ croppingRef }: Props): VNode {
  const [clicked, setClicked] = useState(false);
  const { isInProgress, takeScreenshot } = useTakeScreenshot();

  const handleClick = useCallback(async () => {
    if (!clicked) {
      const image = await takeScreenshot();
      render(<ScreenshotWidget image={image} />, croppingRef);
    } else {
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
