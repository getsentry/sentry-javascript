export { withSentryGetStaticPaths } from './withSentryGetStaticPaths';
export { withSentryGetStaticProps } from './withSentryGetStaticProps';
export { withSentryGetInitialProps } from './withSentryGetInitialProps';
export { withSentryGetServerSideProps } from './withSentryGetServerSideProps';

// Disclaimer: Keep this file side-effect free. If you have to intruduce a side-effect, make sure it can run on the
// browser and on the server. Reason: Our `getInitialProps` wrapper imports this file and `getInitialProps` might run on
// the browser and / or on the server.
