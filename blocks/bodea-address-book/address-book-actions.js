/**
 * Commerce account address mutations for the custom locations UI.
 */

import {
  getCustomerAddress,
  removeCustomerAddress,
  updateCustomerAddress,
} from '@dropins/storefront-account/api.js';

/**
 * @param {string} siteId - delivery site id (Commerce uid or id as string)
 */
export async function removeAddressBySiteId(siteId) {
  const rows = await getCustomerAddress();
  const row = rows.find((r) => String(r.uid ?? r.id) === String(siteId));
  if (!row?.id) {
    throw new Error('Address not found');
  }
  return removeCustomerAddress(Number(row.id));
}

/**
 * Set this address as default shipping (Magento: clears other default shipping).
 * @param {string} siteId
 */
export async function setDefaultShippingBySiteId(siteId) {
  const rows = await getCustomerAddress();
  const row = rows.find((r) => String(r.uid ?? r.id) === String(siteId));
  if (!row?.id) {
    throw new Error('Address not found');
  }
  return updateCustomerAddress({
    addressId: Number(row.id),
    defaultShipping: true,
  });
}
