import { InitDecider } from '../src/utils/initDecider';
import { NextjsOptions } from '../src/utils/nextjsOptions';

function setDevEnv(): void {
  process.env.NODE_ENV = 'development';
}

function setProdEnv(): void {
  process.env.NODE_ENV = 'production';
}

function getEmptyOptions(): NextjsOptions {
  return {};
}

function getForceInitTrueOptions(): NextjsOptions {
  return { forceInit: true };
}

function getForceInitFalseOptions(): NextjsOptions {
  return { forceInit: false };
}

describe('decide initialization in development', () => {
  beforeEach(setDevEnv);

  test('without options', () => {
    const initDecider = new InitDecider(getEmptyOptions());
    expect(initDecider.shouldInitSentry()).toBeFalsy();
  });

  test('without forcing init', () => {
    const initDecider = new InitDecider(getForceInitFalseOptions());
    expect(initDecider.shouldInitSentry()).toBeFalsy();
  });

  test('forcing init', () => {
    const initDecider = new InitDecider(getForceInitTrueOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });
});

describe('decide initialization in production', () => {
  beforeEach(setProdEnv);

  test('without options', () => {
    const initDecider = new InitDecider(getEmptyOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });

  test('without forcing init', () => {
    const initDecider = new InitDecider(getForceInitFalseOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });

  test('forcing init', () => {
    const initDecider = new InitDecider(getForceInitTrueOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });
});
