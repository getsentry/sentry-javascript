import { on } from '@ember/modifier';
import { scheduleOnce } from '@ember/runloop';

function createError(): void {
  throw new Error('Generic Javascript Error');
}

function createEmberError(): void {
  throw new Error('Whoops, looks like you have an EmberError');
}

function createCaughtEmberError(): void {
  try {
    throw new Error('Looks like you have a caught EmberError');
  } catch {
    // do nothing - this should NOT be captured by Sentry
  }
}

function createFetchError(): void {
  void fetch('http://doesntexist.example');
}

function createAfterRenderError(): void {
  function throwAfterRender(): void {
    throw new Error('After Render Error');
  }
  // eslint-disable-next-line ember/no-runloop -- scheduleOnce needed to test afterRender errors
  scheduleOnce('afterRender', null, throwAfterRender);
}

function createPromiseRejection(): void {
  new Promise<void>((_resolve, reject) => {
    reject('Promise rejected');
  });
}

function createPromiseError(): void {
  new Promise<void>(() => {
    throw new Error('Error within Promise');
  });
}

<template>
  <h2>Test Error Scenarios</h2>
  <p>Click the buttons below to trigger different error scenarios.</p>

  <div class="error-buttons">
    <button
      type="button"
      data-test-button="Throw Generic Javascript Error"
      {{on "click" createError}}
    >
      Throw Generic Javascript Error
    </button>

    <button
      type="button"
      data-test-button="Throw EmberError"
      {{on "click" createEmberError}}
    >
      Throw EmberError
    </button>

    <button
      type="button"
      data-test-button="Caught Thrown EmberError"
      {{on "click" createCaughtEmberError}}
    >
      Caught Thrown EmberError
    </button>

    <button
      type="button"
      data-test-button="Error From Fetch"
      {{on "click" createFetchError}}
    >
      Error From Fetch
    </button>

    <button
      type="button"
      data-test-button="Error in AfterRender"
      {{on "click" createAfterRenderError}}
    >
      Error in AfterRender
    </button>

    <button
      type="button"
      data-test-button="Promise Rejection"
      {{on "click" createPromiseRejection}}
    >
      Promise Rejection
    </button>

    <button
      type="button"
      data-test-button="Error inside Promise"
      {{on "click" createPromiseError}}
    >
      Error inside Promise
    </button>
  </div>
</template>
