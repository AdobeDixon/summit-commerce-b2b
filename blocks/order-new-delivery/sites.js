import { getCustomerAddress } from '@dropins/storefront-account/api.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { getCookie } from '@dropins/tools/lib.js';
import { events } from '@dropins/tools/event-bus.js';

function getAuthDropinToken() {
  return getCookie('auth_dropin_user_token');
}

/** Must match storefront-company-switcher `companySessionStorageKey` */
export const COMPANY_SESSION_STORAGE_KEY = 'DROPIN__COMPANYSWITCHER__COMPANY__CONTEXT';

/**
 * Current B2B company for the logged-in customer (authoritative — does not depend on stale
 * sessionStorage from a previous login or another company (same browser tab).
 */
const GET_CURRENT_B2B_COMPANY_QUERY = `
  query GetCurrentCompanyForDeliverySites {
    company {
      id
      name
    }
  }
`;

/** Same fields as storefront-account GET_CUSTOMER_ADDRESS — use CORE client as fallback. */
const GET_CUSTOMER_ADDRESS_QUERY = `
  query GET_CUSTOMER_ADDRESS_CORE {
    customer {
      addresses {
        firstname
        lastname
        middlename
        fax
        prefix
        suffix
        city
        company
        country_code
        region {
          region
          region_code
          region_id
        }
        custom_attributesV2 {
          ... on AttributeValue {
            code
            value
          }
        }
        telephone
        id
        vat_id
        postcode
        street
        default_shipping
        default_billing
        uid
      }
    }
  }
`;

/**
 * B2B: company-switcher sets X-Adobe-Company on CORE_FETCH_GRAPHQL. The dashboard block can run
 * before initializeDropins imports it — load it before address queries.
 */
async function ensureCompanySwitcherLoaded() {
  if (getConfigValue('commerce-companies-enabled') !== true) return;
  await import('../../scripts/initializers/company-switcher.js');
}

/**
 * Align X-Adobe-Company + sessionStorage with Commerce `company { id }` for this session.
 * Fixes wrong company scope when the tab still holds another account’s company id.
 */
async function syncCompanyHeaderWithCommerce() {
  if (getConfigValue('commerce-companies-enabled') !== true) return;
  if (!getAuthDropinToken()) return;

  const { CORE_FETCH_GRAPHQL } = await import('../../scripts/commerce.js');

  try {
    const res = await CORE_FETCH_GRAPHQL.fetchGraphQl(GET_CURRENT_B2B_COMPANY_QUERY, {
      method: 'GET',
      cache: 'no-cache',
    });
    if (res?.errors?.length) return;

    const companyId = res?.data?.company?.id;
    if (!companyId) return;

    const prev = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
    if (prev !== companyId) {
      sessionStorage.setItem(COMPANY_SESSION_STORAGE_KEY, companyId);
    }
    CORE_FETCH_GRAPHQL.setFetchGraphQlHeader('X-Adobe-Company', companyId);
    try {
      events.emit('companyContext/changed', companyId);
    } catch {
      /* ignore */
    }
  } catch {
    /* non-B2B or network — leave existing headers */
  }
}

/**
 * Fetch addresses via the shared Commerce GraphQL client (same headers as checkout / account UI).
 * Used when getCustomerAddress() returns [] but the session should have addresses.
 */
async function fetchCustomerAddressesFromCoreGraphql() {
  const { CORE_FETCH_GRAPHQL } = await import('../../scripts/commerce.js');
  const res = await CORE_FETCH_GRAPHQL.fetchGraphQl(GET_CUSTOMER_ADDRESS_QUERY, {
    method: 'GET',
    cache: 'no-cache',
  });
  if (res?.errors?.length) {
    return [];
  }
  const list = res?.data?.customer?.addresses;
  return Array.isArray(list) ? list : [];
}

function notifyDeliverySitesChanged(count) {
  try {
    document.dispatchEvent(
      new CustomEvent('bodea-delivery-sites-changed', {
        bubbles: true,
        detail: { count },
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {Object} DeliverySite
 * @property {string} id - Stable id (Commerce address `uid`, or fallback)
 * @property {string} name - Display name (company or contact + city)
 * @property {string} address1 - First street line (legacy / summary)
 * @property {string[]} streetLines - Full street lines for checkout
 * @property {string} city
 * @property {string} region
 * @property {string} postcode
 * @property {string} countryCode
 * @property {string} type - UI label key, e.g. default-shipping | saved-address
 */

let deliverySites = [];

/**
 * Maps Commerce customer address book entries to delivery-site cards.
 * @param {object[]} addresses - Normalized addresses from getCustomerAddress()
 * @returns {DeliverySite[]}
 */
export function mapCustomerAddressesToDeliverySites(addresses) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return [];
  }

  return addresses.map((addr, index) => {
    const streetRaw = addr.street;
    let streetLines = [];

    if (typeof streetRaw === 'string' && streetRaw.trim()) {
      streetLines = streetRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(streetRaw)) {
      streetLines = streetRaw.map((s) => String(s).trim()).filter(Boolean);
    }

    const address1 = streetLines[0] || '';

    const firstName = 'firstName' in addr ? addr.firstName : addr.firstname;
    const lastName = 'lastName' in addr ? addr.lastName : addr.lastname;
    const company = addr.company && String(addr.company).trim();
    const contactName = [firstName, lastName].filter(Boolean).join(' ');

    const name = company
      || contactName
      || address1
      || `Delivery location ${index + 1}`;

    const regionObj = addr.region;
    const region = regionObj
      ? (
        regionObj.region
        || regionObj.regionCode
        || regionObj.region_code
        || String(regionObj.region_id ?? regionObj.regionId ?? '')
      )
      : '';

    const postcode = addr.postcode || '';
    const city = addr.city || '';

    let countryCode = 'countryCode' in addr && addr.countryCode
      ? addr.countryCode
      : (addr.country_code || '');
    if (!countryCode && postcode && /^[A-Z]{1,2}\d/i.test(String(postcode).replace(/\s/g, ''))) {
      countryCode = 'GB';
    }

    const defaultShipping = 'defaultShipping' in addr
      ? !!addr.defaultShipping
      : !!addr.default_shipping;

    const defaultBilling = 'defaultBilling' in addr
      ? !!addr.defaultBilling
      : !!addr.default_billing;

    const telephone = addr.telephone ? String(addr.telephone).trim() : '';

    const idRaw = addr.uid ?? addr.id;
    const id = idRaw != null ? String(idRaw) : `address-${index}`;

    let streetOut = streetLines.length ? streetLines : [];
    if (!streetOut.length && address1) {
      streetOut = [address1];
    } else if (!streetOut.length) {
      streetOut = [''];
    }

    return {
      id,
      name,
      address1,
      streetLines: streetOut,
      city,
      region: typeof region === 'string' ? region : String(region),
      postcode,
      countryCode,
      defaultShipping,
      defaultBilling,
      telephone,
      type: defaultShipping ? 'default-shipping' : 'saved-address',
    };
  });
}

/**
 * Prefer default shipping, then default billing, else first saved row.
 * @param {Array<Object>} sites - delivery sites from mapCustomerAddressesToDeliverySites
 * @returns {Object | null}
 */
export function getPrimaryDeliverySite(sites) {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  const ship = sites.find((s) => s.defaultShipping);
  if (ship) return ship;
  const bill = sites.find((s) => s.defaultBilling);
  if (bill) return bill;
  return sites[0];
}

/**
 * Same ordering as account address list (defaults first), then name.
 * @param {Array<Object>} sites
 * @returns {Array<Object>}
 */
export function sortDeliverySitesForAccountUI(sites) {
  if (!Array.isArray(sites)) return [];
  return [...sites].sort((a, b) => {
    const score = (s) => (s.defaultShipping ? 4 : 0) + (s.defaultBilling ? 2 : 0);
    if (score(b) !== score(a)) return score(b) - score(a);
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  });
}

export function setDeliverySites(sites) {
  deliverySites = Array.isArray(sites) ? sites : [];
}

export function getDeliverySites() {
  return deliverySites;
}

/**
 * Wait until auth has emitted (or already did) so CORE GraphQL has a Bearer token.
 * Avoids an empty address query on first paint (e.g. dashboard eager block).
 */
async function waitForAuthGraphQlReady() {
  if (!getAuthDropinToken()) return;

  if (events.lastPayload('authenticated')) return;

  await new Promise((resolve) => {
    const sub = events.on(
      'authenticated',
      () => {
        sub.off();
        resolve();
      },
      { eager: true },
    );
    setTimeout(() => {
      sub.off();
      resolve();
    }, 4000);
  });
}

/**
 * Loads saved customer addresses from Adobe Commerce and exposes them as delivery sites.
 * Requires `scripts/initializers/account.js` to have run (CORE GraphQL + account drop-in).
 * @param {{ retryIfEmpty?: boolean }} [options]
 * @returns {Promise<DeliverySite[]>}
 */
async function resolveAddressRows() {
  let raw = [];
  try {
    raw = await getCustomerAddress();
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    try {
      const coreRows = await fetchCustomerAddressesFromCoreGraphql();
      raw = Array.isArray(coreRows) ? coreRows : [];
    } catch {
      raw = [];
    }
  }
  return raw;
}

/**
 * Ensures company switcher is loaded, auth is ready, and `X-Adobe-Company` is set on CORE GraphQL.
 * Use before B2B `company { ... }` queries (e.g. dashboard company credit) so the subgraph resolves
 * the correct company — same preparation as {@link loadDeliverySitesFromAddressBook}.
 */
export async function ensureB2bCompanyGraphqlContext() {
  await ensureCompanySwitcherLoaded();
  await waitForAuthGraphQlReady();
  await syncCompanyHeaderWithCommerce();
  await new Promise((r) => {
    setTimeout(r, 50);
  });
}

export async function loadDeliverySitesFromAddressBook(options = {}) {
  const { retryIfEmpty = false } = options;

  await ensureB2bCompanyGraphqlContext();

  let raw = await resolveAddressRows();
  let sites = mapCustomerAddressesToDeliverySites(raw);

  if (retryIfEmpty && getAuthDropinToken() && sites.length === 0) {
    const delaysMs = [120, 300, 600, 1200];
    for (let i = 0; i < delaysMs.length && sites.length === 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => {
        setTimeout(r, delaysMs[i]);
      });
      // eslint-disable-next-line no-await-in-loop
      await syncCompanyHeaderWithCommerce();
      // eslint-disable-next-line no-await-in-loop
      raw = await resolveAddressRows();
      sites = mapCustomerAddressesToDeliverySites(raw);
    }
  }

  setDeliverySites(sites);
  notifyDeliverySitesChanged(sites.length);
  return sites;
}

export function getSiteSearchLabel(site) {
  return `${site.name} (${site.city})`;
}

export function findSiteById(siteId) {
  return getDeliverySites().find((site) => site.id === siteId) || null;
}

export function findSiteBySearchValue(searchValue) {
  const normalizedValue = searchValue.trim().toLowerCase();

  return getDeliverySites().find((site) => (
    getSiteSearchLabel(site).toLowerCase() === normalizedValue
      || site.name.toLowerCase() === normalizedValue
  )) || null;
}
