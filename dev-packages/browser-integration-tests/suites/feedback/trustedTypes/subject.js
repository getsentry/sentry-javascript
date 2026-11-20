window.__TRUSTED_TYPES_VIOLATIONS__ = [];
document.addEventListener('securitypolicyviolation', e => {
  window.__TRUSTED_TYPES_VIOLATIONS__.push(`${e.violatedDirective}: ${e.sample}`);
});
