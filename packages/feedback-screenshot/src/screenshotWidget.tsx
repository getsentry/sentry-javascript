import { h, render } from 'preact';
import type { VNode } from 'preact';

type Props = { image: string | undefined };
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function ScreenshotWidget({ image }: Props): VNode | null {
  return image ? (
    <div style="height:1000px; width: 1000px; background:red; padding:5px;">
      <img src={image} style="width:100%;height:100%;object-fit:contain;"></img>
    </div>
  ) : null;
}
