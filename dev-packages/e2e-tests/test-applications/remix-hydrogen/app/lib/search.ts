import type {
  PredictiveArticleFragment,
  PredictiveCollectionFragment,
  PredictivePageFragment,
  PredictiveProductFragment,
  PredictiveQueryFragment,
  SearchProductFragment,
} from 'storefrontapi.generated';

export function applyTrackingParams(
  resource:
    | PredictiveQueryFragment
    | SearchProductFragment
    | PredictiveProductFragment
    | PredictiveCollectionFragment
    | PredictiveArticleFragment
    | PredictivePageFragment,
  params?: string,
) {
  if (params) {
    return resource?.trackingParameters ? `?${params}&${resource.trackingParameters}` : `?${params}`;
  } else {
    return resource?.trackingParameters ? `?${resource.trackingParameters}` : '';
  }
}
