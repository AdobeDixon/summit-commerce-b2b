import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';
import { COMPANY_SESSION_STORAGE_KEY } from './sites.js';

/**
 * Catalog Service `products(skus:)` + ProductView prices — same path as PDP.
 * Core GraphQL `products(filter: { sku })` often returns null `price_range` on Storefront/B2B.
 */
const EQUIPMENT_PRICES_QUERY = `
  query GetEquipmentPrices($skus: [String]) {
    products(skus: $skus) {
      __typename
      sku
      ... on SimpleProductView {
        price {
          final {
            amount {
              value
              currency
            }
          }
          regular {
            amount {
              value
              currency
            }
          }
        }
      }
      ... on ComplexProductView {
        priceRange {
          minimum {
            final {
              amount {
                value
                currency
              }
            }
            regular {
              amount {
                value
                currency
              }
            }
          }
        }
      }
    }
  }
`;

function syncCsCompanyHeader() {
  if (getConfigValue('commerce-companies-enabled') !== true) {
    return;
  }
  const companyId = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
  if (companyId) {
    CS_FETCH_GRAPHQL.setFetchGraphQlHeader('X-Adobe-Company', companyId);
  }
}

function extractPriceFromProductView(pv) {
  const typename = pv?.__typename;
  if (typename === 'SimpleProductView') {
    const fin = pv.price?.final?.amount;
    const reg = pv.price?.regular?.amount;
    const value = fin?.value ?? reg?.value;
    const currency = fin?.currency || reg?.currency;
    if (value != null && currency) {
      return { value: Number(value), currency };
    }
    return null;
  }
  if (typename === 'ComplexProductView') {
    const min = pv.priceRange?.minimum;
    const fin = min?.final?.amount;
    const reg = min?.regular?.amount;
    const value = fin?.value ?? reg?.value;
    const currency = fin?.currency || reg?.currency;
    if (value != null && currency) {
      return { value: Number(value), currency };
    }
    return null;
  }
  return null;
}

/**
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
export function formatMoneyAmount(value, currency) {
  if (value == null || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || ''} ${Number(value).toFixed(2)}`.trim();
  }
}

/**
 * Fetches catalog prices for equipment SKUs via Catalog Service (ProductView), with B2B company
 * header when applicable.
 * @param {string[]} skus
 * @returns {Promise<Record<string, { value: number, currency: string } | null>>}
 */
export async function fetchEquipmentSkuPrices(skus) {
  const unique = [...new Set(skus.filter(Boolean))];
  const map = Object.fromEntries(unique.map((s) => [s, null]));

  if (!unique.length) {
    return map;
  }

  syncCsCompanyHeader();

  let response;
  try {
    response = await CS_FETCH_GRAPHQL.fetchGraphQl(EQUIPMENT_PRICES_QUERY, {
      method: 'GET',
      variables: { skus: unique },
    });
  } catch (err) {
    console.warn('order-new-delivery: Equipment price request failed.', err);
    return map;
  }

  if (response?.errors?.length) {
    const msgs = response.errors.map((e) => e.message).join('; ');
    console.warn('order-new-delivery: Equipment price GraphQL errors:', msgs);
    return map;
  }

  const products = response?.data?.products ?? [];
  if (!Array.isArray(products)) {
    return map;
  }

  products.forEach((pv) => {
    const sku = pv?.sku;
    if (!sku) return;
    const parsed = extractPriceFromProductView(pv);
    if (parsed) {
      map[sku] = parsed;
    }
  });

  return map;
}
