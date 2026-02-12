import * as React from 'react';
import { withProfiler } from '@sentry/react';

function ProfilerTestComponent() {
  return <div id="profiler-test">withProfiler works</div>;
}
ProfilerTestComponent.customStaticMethod = () => 'static method works';
const ProfiledComponent = withProfiler(ProfilerTestComponent);

const Index = () => {
  const [caughtError, setCaughtError] = React.useState(false);
  const [uncaughtError, setUncaughtError] = React.useState(false);

  return (
    <>
      <div>
        <ProfiledComponent />
        <SampleErrorBoundary>
          <h1>React 19</h1>
          {caughtError && <Throw error="caught" />}
          <button id="caughtError-button" onClick={() => setCaughtError(true)}>
            Throw caught error
          </button>
        </SampleErrorBoundary>
      </div>
      <div>
        {uncaughtError && <Throw error="uncaught" />}
        <button id="uncaughtError-button" onClick={() => setUncaughtError(true)}>
          Throw uncaught error
        </button>
      </div>
    </>
  );
};

function Throw({ error }) {
  throw new Error(`${error} error`);
}

class SampleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error });
    // no-op
  }

  render() {
    if (this.state.error) {
      return <div>Caught an error: {JSON.stringify(this.state.error)}</div>;
    }
    return this.props.children;
  }
}

export default Index;
