import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  GetStaticProps,
  GetStaticPropsContext,
  GetStaticPropsResult,
  NextPage,
  NextPageContext,
} from 'next';

type Props = { [key: string]: unknown };

export type GSProps = {
  fn: GetStaticProps;
  wrappedFn: GetStaticProps;
  context: GetStaticPropsContext;
  result: GetStaticPropsResult<Props>;
};

export type GSSP = {
  fn: GetServerSideProps;
  wrappedFn: GetServerSideProps;
  context: GetServerSidePropsContext;
  result: GetServerSidePropsResult<Props>;
};

export type GIProps = {
  fn: Required<NextPage>['getInitialProps'];
  wrappedFn: NextPage['getInitialProps'];
  context: NextPageContext;
  result: unknown;
};

export type DataFetchingFunction = GSProps | GSSP | GIProps;
