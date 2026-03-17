import React, { useEffect } from 'react';
import * as Sentry from '@sentry/browser';

function MfeHeader() {
  useEffect(() => {
    Sentry.withScope(scope => {
      scope.setTag('mfe.name', 'mfe-header');
      fetch('http://localhost:6969/api/header-data');
    });
  }, []);

  return <div id="mfe-header">Header MFE</div>;
}

export default MfeHeader;
