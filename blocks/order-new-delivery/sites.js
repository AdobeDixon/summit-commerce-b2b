export const DELIVERY_SITES = [
  {
    id: 'site-manchester-001',
    name: 'Manchester Distribution Centre',
    address1: '1 Logistics Way',
    city: 'Manchester',
    region: 'Greater Manchester',
    postcode: 'M17 1AA',
    countryCode: 'GB',
    type: 'distribution-centre',
  },
  {
    id: 'site-birmingham-002',
    name: 'Birmingham Service Hub',
    address1: '250 Trade Park Road',
    city: 'Birmingham',
    region: 'West Midlands',
    postcode: 'B24 9FD',
    countryCode: 'GB',
    type: 'service-hub',
  },
  {
    id: 'site-leeds-003',
    name: 'Leeds Customer Depot',
    address1: '44 Industrial Estate',
    city: 'Leeds',
    region: 'West Yorkshire',
    postcode: 'LS10 1AB',
    countryCode: 'GB',
    type: 'depot',
  },
  {
    id: 'site-bristol-004',
    name: 'Bristol Retail Network Site',
    address1: '12 Avon Freight Lane',
    city: 'Bristol',
    region: 'Bristol',
    postcode: 'BS11 8DG',
    countryCode: 'GB',
    type: 'retail-site',
  },
];

export function getSiteSearchLabel(site) {
  return `${site.name} (${site.city})`;
}

export function findSiteById(siteId) {
  return DELIVERY_SITES.find((site) => site.id === siteId) || null;
}

export function findSiteBySearchValue(searchValue) {
  const normalizedValue = searchValue.trim().toLowerCase();

  return DELIVERY_SITES.find((site) => (
    getSiteSearchLabel(site).toLowerCase() === normalizedValue
      || site.name.toLowerCase() === normalizedValue
  )) || null;
}
