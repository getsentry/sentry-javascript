import { LinkTo } from '@ember/routing';

<template>
  <h2>Tracing</h2>
  <LinkTo @route="slow-loading-route" data-test-button="Transition to slow loading route">
    Transition to slow loading route
  </LinkTo>
</template>
