const iframe = document.createElement('iframe');

iframe.srcdoc = `
  <script>
    try {
      throw new Error('iframe root error', {
        cause: new Error('iframe cause error'),
      });
    } catch (error) {
      parent.Sentry.captureException(error);
    }
  <\/script>
`;

document.body.appendChild(iframe);
