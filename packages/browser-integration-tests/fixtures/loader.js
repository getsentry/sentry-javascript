!function(e,n,r,t,i,o,a,c,s){for(var f=s,forceLoad=!1,u=0;u<document.scripts.length;u++)if(document.scripts[u].src.indexOf(o)>-1){f&&"no"===document.scripts[u].getAttribute("data-lazy")&&(f=!1);break}var p=!1,d=[],l=function(e){("e"in e||"p"in e||e.f&&e.f.indexOf("capture")>-1||e.f&&e.f.indexOf("showReportDialog")>-1)&&f&&h(d),l.data.push(e)};function _(){l({e:[].slice.call(arguments)})}function v(e){l({p:"reason"in e?e.reason:"detail"in e&&"reason"in e.detail?e.detail.reason:e})}function h(o){if(!p){p=!0;var s=n.scripts[0],f=n.createElement("script");f.src=a,f.crossOrigin="anonymous",f.addEventListener("load",(function(){try{e.removeEventListener(r,_),e.removeEventListener(t,v),e.SENTRY_SDK_SOURCE="loader";var n=e[i],a=n.init;n.init=function(e){var r=c;for(var t in e)Object.prototype.hasOwnProperty.call(e,t)&&(r[t]=e[t]);!function(e,n){var r=e.integrations||[];if(!Array.isArray(r))return;var t=r.map((function(e){return e.name}));e.tracesSampleRate&&-1===t.indexOf("BrowserTracing")&&r.push(new n.BrowserTracing);(e.replaysSessionSampleRate||e.replaysOnErrorSampleRate)&&-1===t.indexOf("Replay")&&r.push(new n.Replay);e.integrations=r}(r,n),a(r)},function(n,r){try{for(var t=0;t<n.length;t++)"function"==typeof n[t]&&n[t]();var i=l.data,o=!(void 0===(u=e.__SENTRY__)||!u.hub||!u.hub.getClient());i.sort((function(e){return"init"===e.f?-1:0}));var a=!1;for(t=0;t<i.length;t++)if(i[t].f){a=!0;var c=i[t];!1===o&&"init"!==c.f&&r.init(),o=!0,r[c.f].apply(r,c.a)}!1===o&&!1===a&&r.init();var s=e.onerror,f=e.onunhandledrejection;for(t=0;t<i.length;t++)"e"in i[t]&&s?s.apply(e,i[t].e):"p"in i[t]&&f&&f.apply(e,[i[t].p])}catch(e){console.error(e)}var u}(o,n)}catch(e){console.error(e)}})),s.parentNode.insertBefore(f,s)}}l.data=[],e[i]=e[i]||{},e[i].onLoad=function(e){d.push(e),f&&!forceLoad||h(d)},e[i].forceLoad=function(){forceLoad=!0,f&&setTimeout((function(){h(d)}))},["init","addBreadcrumb","captureMessage","captureException","captureEvent","configureScope","withScope","showReportDialog"].forEach((function(n){e[i][n]=function(){l({f:n,a:arguments})}})),e.addEventListener(r,_),e.addEventListener(t,v),f||setTimeout((function(){h(d)}))}
(
  window,
  document,
  'error',
  'unhandledrejection',
  'Sentry',
  'loader.js',
  __LOADER_BUNDLE__,
  __LOADER_OPTIONS__,
  __LOADER_LAZY__
);
