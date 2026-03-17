import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();

  // Reproduces the "span bleed" bug with lazy routes:
  // 1. Navigate to /span-bleed/source (triggers 600ms lazy load + fetch span)
  // 2. After 200ms (before the lazy load resolves), navigate to /span-bleed-destination
  // Expected (correct): fetch span from /span-bleed/source appears only in that page's transaction
  // Actual (bug): fetch span appears in /span-bleed-destination's navigation transaction
  const triggerSpanBleed = () => {
    navigate('/span-bleed/source');
    setTimeout(() => {
      navigate('/span-bleed-destination');
    }, 200);
  };

  return (
    <>
      <Link to="/lazy/inner/123/456/789" id="navigation">
        navigate
      </Link>
      <br />
      <Link to="/another-lazy/sub" id="navigation-to-another">
        Navigate to Another Lazy Route
      </Link>
      <br />
      <Link to="/another-lazy/sub/555/666" id="navigation-to-another-deep">
        Navigate to Another Deep Lazy Route
      </Link>
      <br />
      <Link to="/long-running/slow/12345" id="navigation-to-long-running">
        Navigate to Long Running Lazy Route
      </Link>
      <br />
      <Link to="/delayed-lazy/123" id="navigation-to-delayed-lazy">
        Navigate to Delayed Lazy Parameterized Route
      </Link>
      <br />
      <Link to="/delayed-lazy/123?source=homepage" id="navigation-to-delayed-lazy-with-query">
        Navigate to Delayed Lazy with Query Param
      </Link>
      <br />
      <Link to="/deep/level2/level3/123" id="navigation-to-deep">
        Navigate to Deep Nested Route (3 levels, 900ms total)
      </Link>
      <br />
      <Link to="/slow-fetch/123" id="navigation-to-slow-fetch">
        Navigate to Slow Fetch Route (500ms delay with fetch)
      </Link>
      <br />
      <Link to="/wildcard-lazy/789" id="navigation-to-wildcard-lazy">
        Navigate to Wildcard Lazy Route (500ms delay, no fetch)
      </Link>
      <br />
      <br />
      <strong>Span Bleed Bug Reproduction:</strong>
      <br />
      <Link to="/span-bleed/source" id="navigation-to-span-bleed-source">
        Navigate to Span Bleed Source (600ms delay + fetch)
      </Link>
      <br />
      <Link to="/span-bleed-destination" id="navigation-to-span-bleed-destination">
        Navigate to Span Bleed Destination
      </Link>
      <br />
      {/* Triggers the bug: navigates to the source (slow lazy route), then after 200ms
          navigates to the destination — before the 600ms lazy load resolves.
          The fetch span from the source page's loading should appear only in the
          source navigation transaction, but the bug causes it to appear in the
          destination navigation transaction instead. */}
      <button type="button" id="trigger-span-bleed" onClick={triggerSpanBleed}>
        Trigger Span Bleed (source → destination after 200ms)
      </button>
    </>
  );
};

export default Index;
