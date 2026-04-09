export const CART_CUSTOM_ATTRIBUTE_CODES = Object.freeze({
  orderType: 'chep_order_type',
  transport: 'chep_transport',
  source: 'chep_source',
  siteId: 'chep_site_id',
  siteName: 'chep_site_name',
  contactName: 'chep_contact_name',
  contactPhone: 'chep_contact_phone',
  contactEmail: 'chep_contact_email',
  timeFrom: 'chep_time_from',
  timeTo: 'chep_time_to',
  isSevenDayOrder: 'chep_is_seven_day_order',
});

function trimString(value) {
  return String(value ?? '').trim();
}

function normalizeOrderType(orderType) {
  return orderType === 'seven-day' ? '7day' : 'single';
}

function normalizeTransport(transport) {
  return transport === 'customer' ? 'customer' : 'chep';
}

export function buildOrderMetadata(payload) {
  return {
    orderType: normalizeOrderType(payload.orderType),
    transport: normalizeTransport(payload.transport),
    source: trimString(payload.source || 'HCS'),
    siteId: trimString(payload.site?.id),
    siteName: trimString(payload.site?.name),
    contactName: trimString(payload.contact?.name),
    contactPhone: trimString(payload.contact?.phone),
    contactEmail: trimString(payload.contact?.email),
    timeFrom: trimString(payload.deliveryWindow?.from),
    timeTo: trimString(payload.deliveryWindow?.to),
    isSevenDayOrder: normalizeOrderType(payload.orderType) === '7day' ? 'true' : 'false',
  };
}

export function buildCartCustomAttributesPayload(cartId, metadata) {
  return {
    cart_id: cartId,
    custom_attributes: [
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.orderType,
        value: metadata.orderType,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.transport,
        value: metadata.transport,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.source,
        value: metadata.source,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteId,
        value: metadata.siteId,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteName,
        value: metadata.siteName,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactName,
        value: metadata.contactName,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactPhone,
        value: metadata.contactPhone,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactEmail,
        value: metadata.contactEmail,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeFrom,
        value: metadata.timeFrom,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeTo,
        value: metadata.timeTo,
      },
      {
        attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.isSevenDayOrder,
        value: metadata.isSevenDayOrder,
      },
    ],
  };
}
