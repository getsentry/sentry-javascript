/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as StorefrontAPI from '@shopify/hydrogen/storefront-api-types';

export type MoneyFragment = Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;

export type CartLineFragment = Pick<StorefrontAPI.CartLine, 'id' | 'quantity'> & {
  attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
  cost: {
    totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    amountPerQuantity: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    compareAtAmountPerQuantity?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
  };
  merchandise: Pick<StorefrontAPI.ProductVariant, 'id' | 'availableForSale' | 'requiresShipping' | 'title'> & {
    compareAtPrice?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
    price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    image?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>>;
    product: Pick<StorefrontAPI.Product, 'handle' | 'title' | 'id' | 'vendor'>;
    selectedOptions: Array<Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>>;
  };
};

export type CartApiQueryFragment = Pick<
  StorefrontAPI.Cart,
  'updatedAt' | 'id' | 'checkoutUrl' | 'totalQuantity' | 'note'
> & {
  buyerIdentity: Pick<StorefrontAPI.CartBuyerIdentity, 'countryCode' | 'email' | 'phone'> & {
    customer?: StorefrontAPI.Maybe<
      Pick<StorefrontAPI.Customer, 'id' | 'email' | 'firstName' | 'lastName' | 'displayName'>
    >;
  };
  lines: {
    nodes: Array<
      Pick<StorefrontAPI.CartLine, 'id' | 'quantity'> & {
        attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
        cost: {
          totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
          amountPerQuantity: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
          compareAtAmountPerQuantity?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
        };
        merchandise: Pick<StorefrontAPI.ProductVariant, 'id' | 'availableForSale' | 'requiresShipping' | 'title'> & {
          compareAtPrice?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
          price: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
          image?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Image, 'id' | 'url' | 'altText' | 'width' | 'height'>>;
          product: Pick<StorefrontAPI.Product, 'handle' | 'title' | 'id' | 'vendor'>;
          selectedOptions: Array<Pick<StorefrontAPI.SelectedOption, 'name' | 'value'>>;
        };
      }
    >;
  };
  cost: {
    subtotalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalAmount: Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>;
    totalDutyAmount?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
    totalTaxAmount?: StorefrontAPI.Maybe<Pick<StorefrontAPI.MoneyV2, 'currencyCode' | 'amount'>>;
  };
  attributes: Array<Pick<StorefrontAPI.Attribute, 'key' | 'value'>>;
  discountCodes: Array<Pick<StorefrontAPI.CartDiscountCode, 'code' | 'applicable'>>;
};

export type MenuItemFragment = Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'>;

export type ChildMenuItemFragment = Pick<
  StorefrontAPI.MenuItem,
  'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
>;

export type ParentMenuItemFragment = Pick<
  StorefrontAPI.MenuItem,
  'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'
> & {
  items: Array<Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'>>;
};

export type MenuFragment = Pick<StorefrontAPI.Menu, 'id'> & {
  items: Array<
    Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'> & {
      items: Array<Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'>>;
    }
  >;
};

export type ShopFragment = Pick<StorefrontAPI.Shop, 'id' | 'name' | 'description'> & {
  primaryDomain: Pick<StorefrontAPI.Domain, 'url'>;
  brand?: StorefrontAPI.Maybe<{
    logo?: StorefrontAPI.Maybe<{
      image?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Image, 'url'>>;
    }>;
  }>;
};

export type HeaderQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  headerMenuHandle: StorefrontAPI.Scalars['String']['input'];
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type HeaderQuery = {
  shop: Pick<StorefrontAPI.Shop, 'id' | 'name' | 'description'> & {
    primaryDomain: Pick<StorefrontAPI.Domain, 'url'>;
    brand?: StorefrontAPI.Maybe<{
      logo?: StorefrontAPI.Maybe<{
        image?: StorefrontAPI.Maybe<Pick<StorefrontAPI.Image, 'url'>>;
      }>;
    }>;
  };
  menu?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Menu, 'id'> & {
      items: Array<
        Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'> & {
          items: Array<Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'>>;
        }
      >;
    }
  >;
};

export type FooterQueryVariables = StorefrontAPI.Exact<{
  country?: StorefrontAPI.InputMaybe<StorefrontAPI.CountryCode>;
  footerMenuHandle: StorefrontAPI.Scalars['String']['input'];
  language?: StorefrontAPI.InputMaybe<StorefrontAPI.LanguageCode>;
}>;

export type FooterQuery = {
  menu?: StorefrontAPI.Maybe<
    Pick<StorefrontAPI.Menu, 'id'> & {
      items: Array<
        Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'> & {
          items: Array<Pick<StorefrontAPI.MenuItem, 'id' | 'resourceId' | 'tags' | 'title' | 'type' | 'url'>>;
        }
      >;
    }
  >;
};

interface GeneratedQueryTypes {
  '#graphql\n  fragment Shop on Shop {\n    id\n    name\n    description\n    primaryDomain {\n      url\n    }\n    brand {\n      logo {\n        image {\n          url\n        }\n      }\n    }\n  }\n  query Header(\n    $country: CountryCode\n    $headerMenuHandle: String!\n    $language: LanguageCode\n  ) @inContext(language: $language, country: $country) {\n    shop {\n      ...Shop\n    }\n    menu(handle: $headerMenuHandle) {\n      ...Menu\n    }\n  }\n  #graphql\n  fragment MenuItem on MenuItem {\n    id\n    resourceId\n    tags\n    title\n    type\n    url\n  }\n  fragment ChildMenuItem on MenuItem {\n    ...MenuItem\n  }\n  fragment ParentMenuItem on MenuItem {\n    ...MenuItem\n    items {\n      ...ChildMenuItem\n    }\n  }\n  fragment Menu on Menu {\n    id\n    items {\n      ...ParentMenuItem\n    }\n  }\n\n': {
    return: HeaderQuery;
    variables: HeaderQueryVariables;
  };
  '#graphql\n  query Footer(\n    $country: CountryCode\n    $footerMenuHandle: String!\n    $language: LanguageCode\n  ) @inContext(language: $language, country: $country) {\n    menu(handle: $footerMenuHandle) {\n      ...Menu\n    }\n  }\n  #graphql\n  fragment MenuItem on MenuItem {\n    id\n    resourceId\n    tags\n    title\n    type\n    url\n  }\n  fragment ChildMenuItem on MenuItem {\n    ...MenuItem\n  }\n  fragment ParentMenuItem on MenuItem {\n    ...MenuItem\n    items {\n      ...ChildMenuItem\n    }\n  }\n  fragment Menu on Menu {\n    id\n    items {\n      ...ParentMenuItem\n    }\n  }\n\n': {
    return: FooterQuery;
    variables: FooterQueryVariables;
  };
}

interface GeneratedMutationTypes {}

declare module '@shopify/hydrogen' {
  interface StorefrontQueries extends GeneratedQueryTypes {}
  interface StorefrontMutations extends GeneratedMutationTypes {}
}
