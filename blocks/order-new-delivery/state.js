import { getEquipmentProductBySku } from './equipment-products.js';
import { findSiteById } from './sites.js';
import { ORDER_SOURCE } from './commerce-config.js';

export const STEP_SEQUENCE = [
  'orderType',
  'deliveryDate',
  'transport',
  'equipment',
  'siteContact',
  'deliveryWindow',
];

export function createEquipmentLine() {
  return {
    sku: '',
    quantity: 1,
  };
}

export function createInitialState() {
  return {
    activeStep: STEP_SEQUENCE[0],
    completedSteps: [],
    errors: {},
    submitting: false,
    submitError: '',
    submitResult: null,
    data: {
      orderType: '',
      deliveryDate: '',
      source: ORDER_SOURCE,
      transport: '',
      equipment: [createEquipmentLine()],
      siteId: '',
      siteSearch: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      timeFrom: '',
      timeTo: '',
    },
  };
}

export function getNextStep(stepId) {
  const currentIndex = STEP_SEQUENCE.indexOf(stepId);

  if (currentIndex === -1 || currentIndex === STEP_SEQUENCE.length - 1) {
    return null;
  }

  return STEP_SEQUENCE[currentIndex + 1];
}

export function markStepCompleted(state, stepId) {
  if (!state.completedSteps.includes(stepId)) {
    state.completedSteps.push(stepId);
  }
}

export function getSelectedSite(state) {
  return findSiteById(state.data.siteId);
}

function formatOrderType(value) {
  if (value === 'single') return 'Single Order';
  if (value === 'seven-day') return '7 Day Order';
  return 'Not selected';
}

function formatTransport(value) {
  if (value === 'chep') return 'CHEP';
  if (value === 'customer') return 'Customer';
  return 'Not selected';
}

function formatEquipmentSummary(lines) {
  const parts = lines
    .filter((line) => line.sku && Number(line.quantity) > 0)
    .map((line) => {
      const product = getEquipmentProductBySku(line.sku);
      if (!product) {
        return `${line.quantity} x ${line.sku}`;
      }
      return `${line.quantity} x ${product.label}`;
    });

  return parts.length ? parts.join(', ') : 'No equipment selected';
}

function formatSiteSummary(state) {
  const site = getSelectedSite(state);
  const contactName = state.data.contactName || 'No contact';

  if (!site) {
    return 'No site selected';
  }

  return `${site.name}, ${contactName}`;
}

function formatDeliveryWindow(state) {
  const { timeFrom, timeTo } = state.data;

  if (!timeFrom || !timeTo) {
    return 'No delivery window selected';
  }

  return `${timeFrom} to ${timeTo}`;
}

export function getStepSummary(stepId, state) {
  switch (stepId) {
    case 'orderType':
      return formatOrderType(state.data.orderType);
    case 'deliveryDate':
      return state.data.deliveryDate
        ? `${state.data.deliveryDate} from ${state.data.source}`
        : 'No date selected';
    case 'transport':
      return formatTransport(state.data.transport);
    case 'equipment':
      return formatEquipmentSummary(state.data.equipment);
    case 'siteContact':
      return formatSiteSummary(state);
    case 'deliveryWindow':
      return formatDeliveryWindow(state);
    default:
      return '';
  }
}
