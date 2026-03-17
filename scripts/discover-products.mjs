#!/usr/bin/env node
/**
 * Discover product SKUs available for a customer in Adobe Commerce.
 * Usage: CHEP_DEMO_CUSTOMER_EMAIL=js@ig.com CHEP_DEMO_CUSTOMER_PASSWORD=Password1 node scripts/discover-products.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config.json');

const CUSTOMER_EMAIL = process.env.CHEP_DEMO_CUSTOMER_EMAIL ?? 'js@ig.com';
const CUSTOMER_PASSWORD = process.env.CHEP_DEMO_CUSTOMER_PASSWORD ?? 'Password1';

const GENERATE_CUSTOMER_TOKEN_MUTATION = `
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) {
      token
    }
  }
`;

const PRODUCT_SEARCH_QUERY = `
  query ProductSearch($phrase: String!, $pageSize: Int, $currentPage: Int) {
    productSearch(phrase: $phrase, page_size: $pageSize, current_page: $currentPage) {
      items {
        productView {
          sku
          name
        }
      }
      page_info {
        total_pages
      }
    }
  }
`;

const PRODUCTS_BY_SKU_QUERY = `
  query GetProducts($skus: [String]) {
    products(skus: $skus) {
      sku
      name
    }
  }
`;

const TARGET_SKUS = [
  'CHEP-UK-WOOD-1200X1000-01',
  'CHEP-EU-WOOD-1200X800-03',
  'CHEP-WOOD-METAL-800X600-08',
  'CHEP-PLASTIC-1200X800-01120',
  'CHEP-PLASTIC-1200X1000-LIPS-00077',
  'CHEP-PLASTIC-QTR-600X400-16',
];

class FetchGraphQL {
  constructor() {
    this._endpoint = undefined;
    this._headers = {};
  }

  setEndpoint(url) {
    this._endpoint = url;
  }

  setHeaders(headers) {
    this._headers = { ...this._headers, ...headers };
  }

  async fetchGraphQl(query, variables = {}) {
    const res = await fetch(this._endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this._headers,
      },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }
}

async function main() {
  const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const config = rawConfig.public.default;
  const headers = { ...(config.headers?.all ?? {}), ...(config.headers?.cs ?? {}) };

  const client = new FetchGraphQL();
  client.setEndpoint(config['commerce-endpoint']);
  client.setHeaders(headers);

  // Authenticate
  const tokenRes = await client.fetchGraphQl(GENERATE_CUSTOMER_TOKEN_MUTATION, {
    email: CUSTOMER_EMAIL,
    password: CUSTOMER_PASSWORD,
  });
  if (tokenRes?.errors?.length) {
    console.error('Auth failed:', tokenRes.errors.map((e) => e.message).join('; '));
    process.exit(1);
  }
  const token = tokenRes?.data?.generateCustomerToken?.token;
  if (!token) {
    console.error('No token received');
    process.exit(1);
  }
  client.setHeaders({ Authorization: `Bearer ${token}` });
  console.log(`Authenticated as ${CUSTOMER_EMAIL}\n`);

  // Try products(skus: ...) query
  console.log('Checking target CHEP SKUs via products(skus:...)...');
  const productsRes = await client.fetchGraphQl(PRODUCTS_BY_SKU_QUERY, { skus: TARGET_SKUS });
  const productsData = productsRes?.data?.products;
  const productsList = Array.isArray(productsData) ? productsData : (productsData ? [productsData] : []);
  if (productsRes?.errors?.length) {
    console.log('  products query errors:', productsRes.errors.map((e) => e.message).join('; '));
  }
  if (productsList.length > 0) {
    const skus = productsList.map((p) => p?.sku).filter(Boolean);
    console.log('  Found:', skus.join(', '));
  } else {
    console.log('  None of the target CHEP SKUs were found.');
  }

  // Try productSearch with broad terms
  for (const phrase of ['pallet', 'CHEP', 'product']) {
    console.log(`\nproductSearch(phrase="${phrase}")...`);
    const searchRes = await client.fetchGraphQl(PRODUCT_SEARCH_QUERY, {
      phrase,
      pageSize: 20,
      currentPage: 1,
    });
    const searchItems = searchRes?.data?.productSearch?.items ?? [];
    if (searchRes?.errors?.length) {
      console.log('  Errors:', searchRes.errors.map((e) => e.message).join('; '));
      continue;
    }
    const skus = searchItems
      .map((i) => i?.productView?.sku)
      .filter(Boolean);
    if (skus.length > 0) {
      console.log(`  SKUs: ${skus.slice(0, 15).join(', ')}${skus.length > 15 ? '...' : ''}`);
    } else {
      console.log('  No items returned.');
    }
  }

  console.log('\nDone. Use CHEP_DEMO_SKUS="SKU1,SKU2,..." to override SKUs in create-chep-demo-orders.mjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
