import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';
import { COMPANY_SESSION_STORAGE_KEY } from './sites.js';

/**
 * Catalog Service `products(skus:)` + ProductView prices — same path as PDP.
 * Core GraphQL fallback: live / CDN sometimes returns no ProductView rows or empty prices;
 * Core `products(filter:)` + `price_range` often still resolves B2B prices with auth + company.
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

const CORE_EQUIPMENT_PRICES_QUERY = `
  query OrderWizardCorePrices($skus: [String!]!) {
    products(filter: { sku: { in: $skus } }) {
      items {
        sku
        price_range {
          minimum_price {
            final_price {
              value
              currency
            }
            regular_price {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

function syncB2bCompanyHeadersForPriceFetch() {
  if (getConfigValue('commerce-companies-enabled') !== true) {
    return;
  }
  const companyId = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
  if (!companyId) {
    return;
  }
  CS_FETCH_GRAPHQL.setFetchGraphQlHeader('X-Adobe-Company', companyId);
  CORE_FETCH_GRAPHQL.setFetchGraphQlHeader('X-Adobe-Company', companyId);
}

/** CS may return an array or a connection shape depending on environment. */
function normalizeCatalogServiceProducts(payload) {
  const p = payload?.data?.products;
  if (Array.isArray(p)) {
    return p;
  }
  if (p && Array.isArray(p.items)) {
    return p.items;
  }
  return [];
}

function extractPriceFromCoreItem(item) {
  const min = item?.price_range?.minimum_price;
  const fin = min?.final_price;
  const reg = min?.regular_price;
  const value = fin?.value ?? reg?.value;
  const currency = fin?.currency || reg?.currency;
  if (value != null && currency) {
    return { value: Number(value), currency };
  }
  return null;
}

/** Try loose paths before __typename-specific parsing (schema/version drift). */
function extractPriceFromProductViewLoose(pv) {
  if (!pv || typeof pv !== 'object') {
    return null;
  }
  const p = pv.price;
  if (p?.final?.amount?.value != null && p.final.amount.currency) {
    return { value: Number(p.final.amount.value), currency: p.final.amount.currency };
  }
  if (p?.regular?.amount?.value != null && p.regular.amount.currency) {
    return { value: Number(p.regular.amount.value), currency: p.regular.amount.currency };
  }
  const pr = pv.priceRange?.minimum;
  if (pr?.final?.amount?.value != null && pr.final.amount.currency) {
    return { value: Number(pr.final.amount.value), currency: pr.final.amount.currency };
  }
  if (pr?.regular?.amount?.value != null && pr.regular.amount.currency) {
    return { value: Number(pr.regular.amount.value), currency: pr.regular.amount.currency };
  }
  return null;
}

function extractPriceFromProductView(pv) {
  const loose = extractPriceFromProductViewLoose(pv);
  if (loose) {
    return loose;
  }
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

function countPricedEntries(map) {
  return Object.values(map).filter((v) => v && typeof v.value === 'number').length;
}

async function fetchCatalogServicePrices(unique, map) {
  let response;
  try {
    response = await CS_FETCH_GRAPHQL.fetchGraphQl(EQUIPMENT_PRICES_QUERY, {
      method: 'GET',
      variables: { skus: unique },
      cache: 'no-store',
    });
  } catch (err) {
    console.warn('order-new-delivery: Catalog Service price GET failed; trying POST.', err);
    try {
      response = await CS_FETCH_GRAPHQL.fetchGraphQl(EQUIPMENT_PRICES_QUERY, {
        method: 'POST',
        variables: { skus: unique },
        cache: 'no-store',
      });
    } catch (err2) {
      console.warn('order-new-delivery: Catalog Service price POST failed.', err2);
      return;
    }
  }

  if (response?.errors?.length) {
    const msgs = response.errors.map((e) => e.message).join('; ');
    console.warn('order-new-delivery: Catalog Service GraphQL errors (may still have partial data):', msgs);
  }

  const products = normalizeCatalogServiceProducts(response);
  products.forEach((pv) => {
    const sku = pv?.sku;
    if (!sku) return;
    const parsed = extractPriceFromProductView(pv);
    if (parsed) {
      map[sku] = parsed;
    }
  });
}

async function mergeCorePricesForMissingSkus(skus, map) {
  const missing = skus.filter((s) => map[s] == null);
  if (!missing.length) {
    return;
  }

  let response;
  try {
    response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CORE_EQUIPMENT_PRICES_QUERY, {
      method: 'POST',
      variables: { skus: missing },
      cache: 'no-store',
    });
  } catch (err) {
    console.warn('order-new-delivery: Core GraphQL price fetch failed.', err);
    return;
  }

  if (response?.errors?.length) {
    const msgs = response.errors.map((e) => e.message).join('; ');
    console.warn('order-new-delivery: Core price GraphQL errors:', msgs);
    return;
  }

  const items = response?.data?.products?.items ?? [];
  items.forEach((item) => {
    const sku = item?.sku;
    if (!sku || map[sku] != null) {
      return;
    }
    const parsed = extractPriceFromCoreItem(item);
    if (parsed) {
      map[sku] = parsed;
    }
  });
}

/**
 * Fetches catalog prices for equipment SKUs: Catalog Service first, then Core GraphQL for any
 * SKU still without a price (common on live when CS payload is empty or stripped).
 * @param {string[]} skus
 * @returns {Promise<Record<string, { value: number, currency: string } | null>>}
 */
export async function fetchEquipmentSkuPrices(skus) {
  const unique = [...new Set(skus.filter(Boolean))];
  const map = Object.fromEntries(unique.map((s) => [s, null]));

  if (!unique.length) {
    return map;
  }

  syncB2bCompanyHeadersForPriceFetch();

  await fetchCatalogServicePrices(unique, map);

  if (countPricedEntries(map) < unique.length) {
    await mergeCorePricesForMissingSkus(unique, map);
  }

  if (countPricedEntries(map) === 0) {
    console.warn(
      'order-new-delivery: No catalog prices resolved for equipment SKUs. '
      + 'Check Catalog Service + Core endpoints, B2B company header, and shared catalog prices.',
    );
  }

  return map;
}
