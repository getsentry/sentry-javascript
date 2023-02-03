import type { Event } from '@sentry/node';
import { parseSemver } from '@sentry/utils';
import * as childProcess from 'child_process';
import * as path from 'path';

const nodeMajor = parseSemver(process.version).major || 1;

describe('LocalVariables integration', () => {
  test('Should not include local variables by default', done => {
    expect.assertions(2);

    const testScriptPath = path.resolve(__dirname, 'no-local-variables.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = JSON.parse(stdout) as Event;

      const frames = event.exception?.values?.[0].stacktrace?.frames || [];
      const lastFrame = frames[frames.length - 1];

      expect(lastFrame.vars).toBeUndefined();

      const penultimateFrame = frames[frames.length - 2];

      expect(penultimateFrame.vars).toBeUndefined();

      done();
    });
  });

  test('Should include local variables when enabled', done => {
    expect.assertions(4);

    const testScriptPath = path.resolve(__dirname, 'local-variables.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = JSON.parse(stdout) as Event;

      const frames = event.exception?.values?.[0].stacktrace?.frames || [];
      const lastFrame = frames[frames.length - 1];

      expect(lastFrame.function).toBe('Some.two');
      expect(lastFrame.vars).toEqual({ name: 'some name' });

      const penultimateFrame = frames[frames.length - 2];

      expect(penultimateFrame.function).toBe('one');
      expect(penultimateFrame.vars).toEqual({
        name: 'some name',
        arr: [1, '2', null],
        obj: { name: 'some name', num: 5 },
        ty: '<Some>',
      });

      done();
    });
  });

  test('Should include local variables with ESM', done => {
    expect.assertions(4);

    const testScriptPath = path.resolve(__dirname, 'local-variables-caught.mjs');
    const arg = nodeMajor < 12 ? '--experimental-modules' : '';

    childProcess.exec(`node ${arg} ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = JSON.parse(stdout) as Event;

      const frames = event.exception?.values?.[0].stacktrace?.frames || [];
      const lastFrame = frames[frames.length - 1];

      expect(lastFrame.function).toBe('Some.two');
      expect(lastFrame.vars).toEqual({ name: 'some name' });

      const penultimateFrame = frames[frames.length - 2];

      expect(penultimateFrame.function).toBe('one');
      expect(penultimateFrame.vars).toEqual({
        name: 'some name',
        arr: [1, '2', null],
        obj: { name: 'some name', num: 5 },
        ty: '<Some>',
      });

      done();
    });
  });

  test('Includes local variables for caught exceptions when enabled', done => {
    expect.assertions(4);

    const testScriptPath = path.resolve(__dirname, 'local-variables-caught.js');

    childProcess.exec(`node ${testScriptPath}`, { encoding: 'utf8' }, (_, stdout) => {
      const event = JSON.parse(stdout) as Event;

      const frames = event.exception?.values?.[0].stacktrace?.frames || [];
      const lastFrame = frames[frames.length - 1];

      expect(lastFrame.function).toBe('Some.two');
      expect(lastFrame.vars).toEqual({ name: 'some name' });

      const penultimateFrame = frames[frames.length - 2];

      expect(penultimateFrame.function).toBe('one');
      expect(penultimateFrame.vars).toEqual({
        name: 'some name',
        arr: [1, '2', null],
        obj: { name: 'some name', num: 5 },
        ty: '<Some>',
      });

      done();
    });
  });
});
