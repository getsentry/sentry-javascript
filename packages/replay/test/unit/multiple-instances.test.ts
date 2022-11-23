import { Replay } from './../../src';

it('throws on creating multiple instances', function () {
  expect(() => {
    new Replay();
    new Replay();
  }).toThrow();
});
