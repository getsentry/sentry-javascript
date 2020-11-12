<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for VueJS

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/vue/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/browser`, with added functionality related to VueJS. All methods available in
`@sentry/browser` can be imported from `@sentry/vue`.

To use this SDK, call `Sentry.init(options)` before you create a new Vue instance.

```javascript
import Vue from 'vue'
import App from './App'
import router from './router'
import * as Sentry from '@sentry/vue'

Vue.config.productionTip = false

Sentry.init({
  Vue: Vue,
  debug: true,
  dsn: '__PUBLIC_DSN__',
  attachProps: true,
})

/* eslint-disable no-new */
new Vue({
  el: '#app',
  router,
  components: { App },
  template: '<App/>'
})

```
