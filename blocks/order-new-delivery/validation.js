import { getEquipmentProductBySku } from './equipment-products.js';
import { findSiteById, findSiteBySearchValue, getDeliverySites } from './sites.js';
import { STEP_SEQUENCE } from './state.js';

function createValidationResult(fields = {}, summary = '') {
  return {
    valid: Object.keys(fields).length === 0,
    fields,
    summary,
  };
}

function validateOrderType(state) {
  if (!state.data.orderType) {
    return createValidationResult(
      { orderType: 'Select an order type to continue.' },
      'Order type is required.',
    );
  }

  return createValidationResult();
}

function validateDeliveryDate(state) {
  const { deliveryDate } = state.data;

  if (!deliveryDate) {
    return createValidationResult(
      { deliveryDate: 'Choose a delivery date to continue.' },
      'Delivery date is required.',
    );
  }

  return createValidationResult();
}

function validateTransport(state) {
  if (!state.data.transport) {
    return createValidationResult(
      { transport: 'Select a transport option to continue.' },
      'Transport is required.',
    );
  }

  return createValidationResult();
}

function validateEquipment(state) {
  const fields = {};
  const rows = state.data.equipment || [];

  if (!rows.length) {
    return createValidationResult(
      { equipment: 'Add at least one product line.' },
      'Products are required.',
    );
  }

  rows.forEach((line, index) => {
    if (!line.sku) {
      fields[`equipment-${index}-sku`] = 'Choose a product.';
    } else if (!getEquipmentProductBySku(line.sku)) {
      fields[`equipment-${index}-sku`] = 'Select a valid product.';
    }

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      fields[`equipment-${index}-quantity`] = 'Enter a whole quantity greater than zero.';
    }
  });

  return createValidationResult(fields, Object.keys(fields).length ? 'Product lines need attention.' : '');
}

function validateSiteContact(state) {
  const fields = {};

  if (!getDeliverySites().length) {
    fields.siteSearch = 'Add at least one address in your address book before continuing.';
  }

  const selectedSite = findSiteById(state.data.siteId) || findSiteBySearchValue(state.data.siteSearch || '');

  if (!selectedSite) {
    fields.siteSearch = fields.siteSearch
      || 'Select a delivery location from your saved addresses.';
  }

  if (!state.data.contactName.trim()) {
    fields.contactName = 'Enter a contact name.';
  }

  if (!state.data.contactPhone.trim()) {
    fields.contactPhone = 'Enter a contact phone number.';
  }

  if (!state.data.contactEmail.trim()) {
    fields.contactEmail = 'Enter a contact email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.data.contactEmail.trim())) {
    fields.contactEmail = 'Enter a valid email address.';
  }

  return createValidationResult(fields, Object.keys(fields).length ? 'Site and contact details need attention.' : '');
}

function validateDeliveryWindow(state) {
  const fields = {};
  const { timeFrom, timeTo } = state.data;

  if (!timeFrom) {
    fields.timeFrom = 'Select a delivery window start time.';
  }

  if (!timeTo) {
    fields.timeTo = 'Select a delivery window end time.';
  }

  if (timeFrom && timeTo && timeFrom >= timeTo) {
    fields.timeTo = 'End time must be later than start time.';
  }

  return createValidationResult(fields, Object.keys(fields).length ? 'Delivery window is incomplete.' : '');
}

export function validateStep(stepId, state) {
  switch (stepId) {
    case 'orderType':
      return validateOrderType(state);
    case 'deliveryDate':
      return validateDeliveryDate(state);
    case 'transport':
      return validateTransport(state);
    case 'equipment':
      return validateEquipment(state);
    case 'siteContact':
      return validateSiteContact(state);
    case 'deliveryWindow':
      return validateDeliveryWindow(state);
    default:
      return createValidationResult();
  }
}

export function validateAllSteps(state) {
  return STEP_SEQUENCE.reduce((result, stepId) => {
    result[stepId] = validateStep(stepId, state);
    return result;
  }, {});
}
