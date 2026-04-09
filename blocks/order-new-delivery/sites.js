import { getCustomerAddress } from '@dropins/storefront-account/api.js';

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

    const countryCode = 'countryCode' in addr && addr.countryCode
      ? addr.countryCode
      : (addr.country_code || '');

    const postcode = addr.postcode || '';
    const city = addr.city || '';

    const defaultShipping = 'defaultShipping' in addr
      ? !!addr.defaultShipping
      : !!addr.default_shipping;

    const idRaw = addr.uid ?? addr.id;
    const id = idRaw != null ? String(idRaw) : `address-${index}`;

    return {
      id,
      name,
      address1,
      streetLines: streetLines.length ? streetLines : (address1 ? [address1] : ['']),
      city,
      region: typeof region === 'string' ? region : String(region),
      postcode,
      countryCode,
      type: defaultShipping ? 'default-shipping' : 'saved-address',
    };
  });
}

export function setDeliverySites(sites) {
  deliverySites = Array.isArray(sites) ? sites : [];
}

export function getDeliverySites() {
  return deliverySites;
}

/**
 * Loads saved customer addresses from Adobe Commerce and exposes them as delivery sites.
 * Requires `scripts/initializers/account.js` to have run (CORE GraphQL + account drop-in).
 * @returns {Promise<DeliverySite[]>}
 */
export async function loadDeliverySitesFromAddressBook() {
  const raw = await getCustomerAddress();
  const sites = mapCustomerAddressesToDeliverySites(raw);
  setDeliverySites(sites);
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
