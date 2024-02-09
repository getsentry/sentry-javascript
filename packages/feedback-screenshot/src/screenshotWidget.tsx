import { h, createElement } from 'preact';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function Hello() {
  console.log('screenshot widget 1');
  return h('div', null, 'hello');
}
