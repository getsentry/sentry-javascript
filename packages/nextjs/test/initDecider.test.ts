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

function getDevTrueOptions(): NextjsOptions {
  return { enableInDev: true };
}

function getDevFalseOptions(): NextjsOptions {
  return { enableInDev: false };
}

describe('decide initialization in development', () => {
  beforeEach(setDevEnv);

  test('without options', () => {
    const initDecider = new InitDecider(getEmptyOptions());
    expect(initDecider.shouldInitSentry()).toBeFalsy();
  });

  test('without development', () => {
    const initDecider = new InitDecider(getDevFalseOptions());
    expect(initDecider.shouldInitSentry()).toBeFalsy();
  });

  test('with development', () => {
    const initDecider = new InitDecider(getDevTrueOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });
});

describe('decide initialization in production', () => {
  beforeEach(setProdEnv);

  test('without options', () => {
    const initDecider = new InitDecider(getEmptyOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });

  test('without development', () => {
    const initDecider = new InitDecider(getDevFalseOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });

  test('with development', () => {
    const initDecider = new InitDecider(getDevTrueOptions());
    expect(initDecider.shouldInitSentry()).toBeTruthy();
  });
});
