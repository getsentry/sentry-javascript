const WithInitialPropsPage = ({ data }: { data: string }) => <h1>WithInitialPropsPage {data}</h1>;

WithInitialPropsPage.getInitialProps = () => {
  return { data: '[some getInitialProps data]' };
};

export default WithInitialPropsPage;
