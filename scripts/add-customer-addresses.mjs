#!/usr/bin/env node
/**
 * Add saved addresses (e.g. UK site locations) to a customer address book via GraphQL.
 *
 * Usage:
 *   ADDRESS_BOOK_EMAIL=joe@example.com ADDRESS_BOOK_PASSWORD=secret node scripts/add-customer-addresses.mjs
 *
 * Also accepts CHEP_DEMO_CUSTOMER_EMAIL / CHEP_DEMO_CUSTOMER_PASSWORD for consistency
 * with other Commerce scripts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config.json');

const CUSTOMER_EMAIL = (
  process.env.ADDRESS_BOOK_EMAIL
  || process.env.CHEP_DEMO_CUSTOMER_EMAIL
  || ''
).trim();
const CUSTOMER_PASSWORD = (
  process.env.ADDRESS_BOOK_PASSWORD
  || process.env.CHEP_DEMO_CUSTOMER_PASSWORD
  || ''
);

/** UK site-style addresses (company = location label). */
const SITE_ADDRESSES = [
  {
    company: 'Terrablock — London Hub',
    street: ['Unit 3, Meridian Industrial Estate', 'Romney Road'],
    city: 'Croydon',
    regionLabel: 'Greater London',
    postcode: 'CR0 3RL',
    telephone: '020 7946 0958',
  },
  {
    company: 'Terrablock — Manchester DC',
    street: ['1 Logistics Way'],
    city: 'Manchester',
    regionLabel: 'Greater Manchester',
    postcode: 'M17 1AA',
    telephone: '0161 555 0142',
  },
  {
    company: 'Terrablock — Edinburgh Depot',
    street: ['Block 2', 'Edinburgh Park'],
    city: 'Edinburgh',
    regionLabel: 'Midlothian',
    postcode: 'EH12 9DQ',
    telephone: '0131 555 0100',
  },
  {
    company: 'Terrablock — Cardiff Site',
    street: ['Plot 7', 'Wentloog Corporate Park'],
    city: 'Cardiff',
    regionLabel: 'South Glamorgan',
    postcode: 'CF3 2EU',
    telephone: '029 2010 0200',
  },
  {
    company: 'Terrablock — Belfast Hub',
    street: ['Suite 4', 'Dargan Road'],
    city: 'Belfast',
    regionLabel: 'County Antrim',
    postcode: 'BT3 9JU',
    telephone: '028 9035 5555',
  },
];

const GENERATE_CUSTOMER_TOKEN_MUTATION = `
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) {
      token
    }
  }
`;

const GET_COMPANY_CONTEXT_QUERY = `
  query GetCompanyContext {
    company {
      id
      name
    }
  }
`;

const CREATE_CUSTOMER_ADDRESS_MUTATION = `
  mutation CreateCustomerAddress($input: CustomerAddressInput!) {
    createCustomerAddress(input: $input) {
      uid
      firstname
      lastname
      company
      city
      postcode
    }
  }
`;

class FetchGraphQL {
  constructor() {
    this._endpoint = undefined;
    this._headers = {};
  }

  setEndpoint(url) {
    this._endpoint = url;
  }

  setHeader(key, value) {
    this._headers = { ...this._headers, [key]: value };
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

function buildAddressInput(addr, index) {
  return {
    firstname: 'Joe',
    lastname: 'Terrablock',
    company: addr.company,
    street: addr.street,
    city: addr.city,
    postcode: addr.postcode,
    country_code: 'GB',
    telephone: addr.telephone,
    region: {
      region: addr.regionLabel,
    },
    default_billing: index === 0,
    default_shipping: index === 0,
  };
}

async function main() {
  if (!CUSTOMER_EMAIL || !CUSTOMER_PASSWORD) {
    console.error(
      'Set ADDRESS_BOOK_EMAIL and ADDRESS_BOOK_PASSWORD '
      + '(or CHEP_DEMO_CUSTOMER_EMAIL / CHEP_DEMO_CUSTOMER_PASSWORD).',
    );
    process.exit(1);
  }

  const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const config = rawConfig.public.default;
  const headers = { ...(config.headers?.all ?? {}), ...(config.headers?.cs ?? {}) };

  const client = new FetchGraphQL();
  client.setEndpoint(config['commerce-endpoint']);
  client.setHeaders(headers);

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
    console.error('No customer token returned.');
    process.exit(1);
  }

  client.setHeader('Authorization', `Bearer ${token}`);

  const companyRes = await client.fetchGraphQl(GET_COMPANY_CONTEXT_QUERY, {});
  const companyId = companyRes?.data?.company?.id;
  if (companyId) {
    client.setHeader('X-Adobe-Company', companyId);
    console.log(`Company context: ${companyRes?.data?.company?.name ?? companyId}`);
  }

  console.log(`Adding ${SITE_ADDRESSES.length} addresses for ${CUSTOMER_EMAIL}...\n`);

  for (let i = 0; i < SITE_ADDRESSES.length; i += 1) {
    const addr = SITE_ADDRESSES[i];
    const input = buildAddressInput(addr, i);
    const res = await client.fetchGraphQl(CREATE_CUSTOMER_ADDRESS_MUTATION, { input });

    if (res?.errors?.length) {
      console.error(`FAILED ${addr.company}:`, res.errors.map((e) => e.message).join('; '));
      continue;
    }

    const created = res?.data?.createCustomerAddress;
    console.log(`OK  ${addr.company}`);
    console.log(`    uid=${created?.uid ?? '?'}  ${created?.city}, ${created?.postcode}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
