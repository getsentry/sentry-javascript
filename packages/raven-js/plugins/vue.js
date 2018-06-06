/**
 * Vue.js 2.0 plugin
 *
 */

function formatComponentName(vm) {
  if (vm.$root === vm) {
    return 'root instance';
  }
  var name = vm._isVue ? vm.$options.name || vm.$options._componentTag : vm.name;
  return (
    (name ? 'component <' + name + '>' : 'anonymous component') +
    (vm._isVue && vm.$options.__file ? ' at ' + vm.$options.__file : '')
  );
}

function vuePlugin(Raven, Vue) {
  Vue = Vue || window.Vue;

  // quit if Vue isn't on the page
  if (!Vue || !Vue.config) return;

  var _oldOnError = Vue.config.errorHandler;
  Vue.config.errorHandler = function VueErrorHandler(error, vm, info) {
    var metaData = {};

    // vm and lifecycleHook are not always available
    if (Object.prototype.toString.call(vm) === '[object Object]') {
      metaData.componentName = formatComponentName(vm);
      metaData.propsData = vm.$options.propsData;
    }

    if (typeof info !== 'undefined') {
      metaData.lifecycleHook = info;
    }

    Raven.captureException(error, {
      extra: metaData
    });

    if (typeof _oldOnError === 'function') {
      _oldOnError.call(this, error, vm, info);
    }
  };
}

module.exports = vuePlugin;
