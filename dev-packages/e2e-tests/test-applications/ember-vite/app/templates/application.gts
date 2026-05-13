import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

<template>
  {{pageTitle "Ember Vite"}}

  <div class="app">
    <h1>Sentry Ember Vite E2E Test</h1>
    <nav>
      <LinkTo @route="index">Errors</LinkTo>
      |
      <LinkTo @route="tracing">Tracing</LinkTo>
      |
      <LinkTo @route="replay">Replay</LinkTo>
    </nav>
    <main>
      {{outlet}}
    </main>
  </div>
</template>
