import {
  initializeCart,
  addProductsToCart,
  updateProductsFromCart,
} from '@dropins/storefront-cart/api.js';
import {
  setShippingAddress,
  setBillingAddress,
  setShippingMethods,
  setPaymentMethod,
} from '@dropins/storefront-checkout/api.js';
import { placeOrder } from '@dropins/storefront-order/api.js';
import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../../scripts/commerce.js';
import {
  DEFAULT_PAYMENT_METHOD_CODE,
  DEFAULT_SHIPPING_METHOD,
  ORDER_METADATA_COMPATIBILITY_NOTE,
} from './commerce-config.js';
import { getEquipmentProductBySku } from './equipment-products.js';
import {
  buildCartCustomAttributesPayload,
  buildOrderMetadata,
} from './order-metadata.js';

const SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION = `
  mutation SetCustomAttributesOnCart($input: CartCustomAttributesInput!) {
    setCustomAttributesOnCart(input: $input) {
      cart {
        id
        custom_attributes {
          attribute_code
          value
        }
      }
    }
  }
`;

function splitContactName(fullName) {
  const trimmedName = fullName.trim();
  const [firstName = '', ...lastNameParts] = trimmedName.split(/\s+/);
  const lastName = lastNameParts.join(' ') || 'Contact';

  return {
    firstName: firstName || 'Customer',
    lastName,
  };
}

function toAddressInput(site, payload) {
  const { firstName, lastName } = splitContactName(payload.contact.name);
  const street = (site.streetLines && site.streetLines.length)
    ? site.streetLines
    : [site.address1].filter(Boolean);

  return {
    address: {
      firstName,
      lastName,
      company: site.name,
      street: street.length ? street : [''],
      city: site.city,
      region: site.region,
      postcode: site.postcode,
      countryCode: site.countryCode,
      telephone: payload.contact.phone,
      saveInAddressBook: false,
    },
  };
}

function buildCartItems(equipmentLines) {
  const aggregatedItems = equipmentLines.reduce((items, line) => {
    const existing = items[line.sku];
    const quantity = Number(line.quantity);

    if (!existing) {
      items[line.sku] = { sku: line.sku, quantity };
    } else {
      existing.quantity += quantity;
    }

    return items;
  }, {});

  return Object.values(aggregatedItems);
}

function assertSuccessfulCart(cart, contextLabel) {
  if (!cart?.id) {
    throw new Error(`Commerce cart was not returned while ${contextLabel}.`);
  }

  if (cart.errors?.length) {
    const combinedErrors = cart.errors.map((error) => error.text).join(' ');
    throw new Error(combinedErrors || `Cart validation failed while ${contextLabel}.`);
  }
}

function normalizeCommerceError(error) {
  const message = error?.message || 'Unable to place the order.';
  const detail = message.length > 600 ? `${message.slice(0, 600)}…` : message;

  if (/sign in|authenticated|authorization|token/i.test(message)) {
    return 'Your session is no longer authenticated. Sign in again and retry the order.';
  }

  // "You cannot add … to the cart" often means B2B company role ACL (GraphQL user_errors
  // code PERMISSION_DENIED), not missing shared catalog. Do not blame catalog only.
  if (
    /cannot add|not assigned|not available|requested qty|salable|Could not find a (cart|product)/i.test(
      message,
    )
  ) {
    return (
      'These equipment lines could not be added to the cart. Common causes: (1) B2B company role — '
      + 'purchasing/checkout or **category** permissions (Customers → Companies → Roles; some roles only allow '
      + 'specific catalog categories — masonry must be in the **same categories** as working Bodea SKUs). '
      + '(2) Shared catalog — B2B → Shared Catalogs → your company\'s catalog → Products. '
      + '(3) Website scope — each SKU on every B2B website (e.g. Main + Bodea). '
      + 'If GraphQL returns PERMISSION_DENIED, run `npm run link-masonry-pallet-category` to add the pallet '
      + 'equipment category. '
      + `Commerce message: ${detail}`
    );
  }

  if (/carrier|shipping method/i.test(message)) {
    return 'The configured shipping method is not available for this cart. Update the block defaults before go-live.';
  }

  if (/payment method/i.test(message)) {
    return 'The configured payment method is not available for this cart. Update the block defaults before go-live.';
  }

  if (/setCustomAttributesOnCart|metadata persistence|custom attributes GraphQL module/i.test(message)) {
    return message;
  }

  return message;
}

async function ensureAuthenticatedCart() {
  if (!checkIsAuthenticated()) {
    throw new Error('You must be signed in to place a delivery order.');
  }

  const cart = await initializeCart();
  assertSuccessfulCart(cart, 'initializing the customer cart');
  return cart;
}

async function clearCartItems(cart) {
  if (!cart.items?.length) {
    return cart;
  }

  // This block treats the active customer cart as the checkout vehicle for the wizard order.
  const emptiedCart = await updateProductsFromCart(
    cart.items.map((item) => ({
      uid: item.uid,
      quantity: 0,
    })),
  );

  assertSuccessfulCart(emptiedCart, 'clearing existing cart items');
  return emptiedCart;
}

async function addWizardItemsToCart(payload) {
  const cart = await addProductsToCart(buildCartItems(payload.equipment));
  assertSuccessfulCart(cart, 'adding equipment to the cart');
  return cart;
}

async function applyAddresses(payload) {
  const shippingInput = toAddressInput(payload.site, payload);

  await setShippingAddress(shippingInput);

  // Mirror shipping as billing until dedicated B2B billing rules are confirmed.
  await setBillingAddress({ sameAsShipping: true });
}

async function applyDeliveryAndPaymentMethods() {
  await setShippingMethods([DEFAULT_SHIPPING_METHOD]);
  await setPaymentMethod({ code: DEFAULT_PAYMENT_METHOD_CODE });
}

function extractGraphQlErrors(response) {
  if (!response?.errors?.length) {
    return [];
  }

  return response.errors.map((error) => error.message).filter(Boolean);
}

function getMetadataAttributeCodes(customAttributesInput) {
  return customAttributesInput.custom_attributes.map(({ attribute_code: attributeCode }) => attributeCode);
}

function createMetadataPersistenceError(message, cause) {
  const error = new Error(message);
  error.cause = cause;
  error.metadataPersistence = true;
  return error;
}

function getPersistedAttributeCodes(persistedAttributes) {
  return Array.isArray(persistedAttributes)
    ? persistedAttributes.map((attribute) => attribute.attribute_code)
    : [];
}

function getMissingAttributeCodes(attributeCodes, persistedAttributes) {
  const persistedCodes = getPersistedAttributeCodes(persistedAttributes);

  return attributeCodes.filter((attributeCode) => !persistedCodes.includes(attributeCode));
}

async function executeSetCustomAttributesOnCart(customAttributesInput) {
  return CORE_FETCH_GRAPHQL.fetchGraphQl(SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION, {
    method: 'POST',
    variables: {
      input: customAttributesInput,
    },
  });
}

export async function persistOrderMetadata({ cartId, metadata }) {
  const customAttributesInput = buildCartCustomAttributesPayload(cartId, metadata);
  const attributeCodes = getMetadataAttributeCodes(customAttributesInput);
  const outgoingCustomAttributes = customAttributesInput.custom_attributes;

  console.info('Attempting cart metadata persistence for order-new-delivery.', {
    cartId,
    attributeCodes,
  });
  console.info('Outgoing cart custom_attributes payload for order-new-delivery.', {
    cartId,
    customAttributes: outgoingCustomAttributes,
  });

  let response;

  try {
    response = await executeSetCustomAttributesOnCart(customAttributesInput);
  } catch (error) {
    console.error('Cart metadata persistence request failed.', {
      cartId,
      attributeCodes,
      message: error.message,
    });
    throw createMetadataPersistenceError(
      `Metadata persistence failed before order placement. ${ORDER_METADATA_COMPATIBILITY_NOTE}`,
      error,
    );
  }

  const graphQlErrors = extractGraphQlErrors(response);
  if (graphQlErrors.length) {
    const combinedErrors = graphQlErrors.join(' ');
    console.error('Cart metadata persistence mutation returned GraphQL errors.', {
      cartId,
      attributeCodes,
      errors: graphQlErrors,
    });

    if (/Cannot query field "setCustomAttributesOnCart"|Unknown type "CartCustomAttributesInput"/i.test(combinedErrors)) {
      throw createMetadataPersistenceError(
        `Cart custom attributes mutation is unavailable in this Commerce environment. ${ORDER_METADATA_COMPATIBILITY_NOTE}`,
        response,
      );
    }

    throw createMetadataPersistenceError(
      `Metadata persistence failed before order placement: ${combinedErrors}`,
      response,
    );
  }

  const persistedAttributes = response?.data?.setCustomAttributesOnCart?.cart?.custom_attributes;
  const persistedCartId = response?.data?.setCustomAttributesOnCart?.cart?.id;
  const persistedAttributeCodes = getPersistedAttributeCodes(persistedAttributes);

  if (!persistedCartId) {
    console.error('Cart metadata persistence returned no cart payload.', {
      cartId,
      attributeCodes,
      response,
    });
    throw createMetadataPersistenceError(
      'Metadata persistence failed before order placement because Commerce returned no cart payload.',
      response,
    );
  }

  const missingAttributeCodes = getMissingAttributeCodes(attributeCodes, persistedAttributes);
  console.info('Returned cart.custom_attributes payload for order-new-delivery.', {
    cartId: persistedCartId,
    customAttributes: persistedAttributes || [],
    persistedAttributeCodes,
  });

  if (missingAttributeCodes.length) {
    console.error('Cart metadata persistence response is missing expected attributes.', {
      cartId: persistedCartId,
      attributeCodes,
      missingAttributeCodes,
      persistedAttributeCodes,
    });
    throw createMetadataPersistenceError(
      `Metadata persistence failed before order placement because Commerce did not return these cart custom attributes: ${missingAttributeCodes.join(', ')}`,
      response,
    );
  }

  console.info('Cart metadata persistence succeeded for order-new-delivery.', {
    cartId: persistedCartId,
    attributeCodes,
    persistedAttributeCodes,
  });

  return {
    persisted: true,
    cartId: persistedCartId,
    customAttributes: persistedAttributes || [],
    metadata,
  };
}

export function buildConfirmationSummary(payload) {
  return {
    orderType: payload.orderType,
    deliveryDate: payload.deliveryDate,
    source: payload.source,
    transport: payload.transport,
    site: payload.site,
    contact: payload.contact,
    deliveryWindow: payload.deliveryWindow,
    equipment: payload.equipment.map((line) => ({
      ...line,
      product: getEquipmentProductBySku(line.sku),
    })),
  };
}

export async function placeDeliveryOrder(payload) {
  try {
    if (!payload.site) {
      throw new Error('A valid delivery site is required before placing the order.');
    }

    let cart = await ensureAuthenticatedCart();
    cart = await clearCartItems(cart);
    cart = await addWizardItemsToCart(payload);

    await applyAddresses(payload);
    await applyDeliveryAndPaymentMethods();

    const metadata = buildOrderMetadata(payload);
    await persistOrderMetadata({ cartId: cart.id, metadata });

    const order = await placeOrder(cart.id);

    if (!order?.number) {
      throw new Error('Commerce placed the order but did not return an order number.');
    }

    return {
      order,
      metadata,
      summary: buildConfirmationSummary(payload),
    };
  } catch (error) {
    throw new Error(normalizeCommerceError(error));
  }
}
