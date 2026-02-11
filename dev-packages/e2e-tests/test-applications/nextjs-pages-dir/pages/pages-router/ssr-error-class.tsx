import React from 'react';

export default class Page extends React.Component {
  render() {
    throw new Error('Pages SSR Error Class');
    return <div>Hello world!</div>;
  }
}

export function getServerSideProps() {
  return {
    props: {
      foo: 'bar',
    },
  };
}
