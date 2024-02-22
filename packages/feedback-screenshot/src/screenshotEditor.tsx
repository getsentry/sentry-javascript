import { h, render } from 'preact';
import type { VNode } from 'preact';

type Props = {
  screenshotImage: HTMLCanvasElement | null;
  setScreenshotImage: (screenshot: HTMLCanvasElement | null) => void;
};
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function ScreenshotWidget({ screenshotImage, setScreenshotImage }: Props): VNode | null {
  const image = screenshotImage;
  return image ? (
    <div style="padding-right: 16px;">
      <img
        type="image"
        src={image.toDataURL()}
        id="screenshot"
        name="screenshot"
        style="width:100%; height:100%;"
      ></img>
    </div>
  ) : null;
}
