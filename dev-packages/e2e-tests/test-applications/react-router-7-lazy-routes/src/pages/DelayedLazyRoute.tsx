import React from 'react';
import { Link, useParams, useLocation, useSearchParams } from 'react-router-dom';

const DelayedLazyRoute = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'none';
  const source = searchParams.get('source') || 'none';

  return (
    <div id="delayed-lazy-ready">
      <h1>Delayed Lazy Route</h1>
      <p id="delayed-lazy-id">ID: {id}</p>
      <p id="delayed-lazy-path">{location.pathname}</p>
      <p id="delayed-lazy-search">{location.search}</p>
      <p id="delayed-lazy-hash">{location.hash}</p>
      <p id="delayed-lazy-view">View: {view}</p>
      <p id="delayed-lazy-source">Source: {source}</p>

      <div id="navigation-links">
        <Link to="/" id="delayed-lazy-home-link">
          Back Home
        </Link>
        <br />
        <Link to="/slow-fetch/222" id="delayed-lazy-to-slow-fetch">
          Go to Slow Fetch Route (500ms)
        </Link>
        <br />
        <Link to="/another-lazy/sub" id="delayed-lazy-to-another-lazy">
          Go to Another Lazy Route
        </Link>
        <br />
        <Link to={`/delayed-lazy/${id}?view=detailed`} id="link-to-query-view-detailed">
          View: Detailed (query param)
        </Link>
        <br />
        <Link to={`/delayed-lazy/${id}?view=list`} id="link-to-query-view-list">
          View: List (query param)
        </Link>
        <br />
        <Link to={`/delayed-lazy/${id}#section1`} id="link-to-hash-section1">
          Section 1 (hash only)
        </Link>
        <br />
        <Link to={`/delayed-lazy/${id}#section2`} id="link-to-hash-section2">
          Section 2 (hash only)
        </Link>
        <br />
        <Link to={`/delayed-lazy/${id}?view=grid#results`} id="link-to-query-and-hash">
          Grid View + Results (query + hash)
        </Link>
      </div>
    </div>
  );
};

export default DelayedLazyRoute;
