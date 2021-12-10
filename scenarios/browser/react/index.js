import React from "react";
import ReactDOM from "react-dom"
import { init } from "@sentry/react";

init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
});

class Hello extends React.Component {
  render() {
    return React.createElement('div', null, `Hello ${this.props.toWhat}`);
  }
}

ReactDOM.render(
  React.createElement(Hello, { toWhat: 'World' }, null),
  // eslint-disable-next-line no-undef
  document.getElementById('root')
);
