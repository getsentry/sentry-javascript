import { h, render } from 'preact';

interface FeedbackScreenshotOptions {
  el: Element;
  props: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function Hello(options: FeedbackScreenshotOptions) {
  console.log('screenshot widget');
  return h('div', null, 'hello');
}
