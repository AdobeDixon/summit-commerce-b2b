/** Shown in wizard and sent as order metadata source (cart custom attribute). */
export const ORDER_SOURCE = 'Bodea';

// TODO: Replace these defaults with the production B2B shipping carrier/method.
export const DEFAULT_SHIPPING_METHOD = Object.freeze({
  carrierCode: 'flatrate',
  methodCode: 'flatrate',
});

// TODO: Replace this with the production B2B payment method code.
export const DEFAULT_PAYMENT_METHOD_CODE = 'checkmo';

// TODO: Ensure the target Commerce environment supports the cart custom attributes GraphQL mutation.
// Downstream admin visibility, export, and operational handling of these values may still require
// additional backend or integration work even when API-level persistence succeeds.
export const ORDER_METADATA_COMPATIBILITY_NOTE = `
Cart custom attributes need API-level GraphQL support in the target Commerce environment.
They do not need pre-created Admin EAV attributes just to be sent through setCustomAttributesOnCart.
Separate backend or integration work may still be needed if these values must be visible in Admin,
indexed, exported, validated, or consumed by downstream operational workflows after order placement.
`.trim();
