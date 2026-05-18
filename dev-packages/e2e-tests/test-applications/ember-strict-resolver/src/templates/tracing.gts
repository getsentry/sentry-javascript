import { LinkTo } from '@ember/routing';
import TestSection from '../components/test-section.gts';

<template>
  <h2>Tracing Test</h2>
  <TestSection @title="Test Component" />

  <div class="tracing-buttons">
    <LinkTo
      @route="slow-loading-route"
      data-test-button="Transition to slow loading route"
    >
      Transition to slow loading route
    </LinkTo>
  </div>
</template>
