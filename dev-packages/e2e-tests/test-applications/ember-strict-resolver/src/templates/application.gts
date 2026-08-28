import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

<template>
  {{pageTitle "Sentry Ember Demo"}}

  <div class="app">
    <h1>Sentry Ember SDK Demo</h1>
    <nav>
      <LinkTo @route="index">Home</LinkTo>
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
