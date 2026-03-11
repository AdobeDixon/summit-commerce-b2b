import { findSiteById } from './sites.js';
import { placeDeliveryOrder } from './commerce-service.js';
import { validateAllSteps } from './validation.js';

export function buildSubmissionPayload(state) {
  const site = findSiteById(state.data.siteId);

  return {
    orderType: state.data.orderType,
    deliveryDate: state.data.deliveryDate,
    source: state.data.source,
    transport: state.data.transport,
    equipment: state.data.equipment.map((line) => ({
      sku: line.sku,
      quantity: Number(line.quantity),
    })),
    site,
    contact: {
      name: state.data.contactName.trim(),
      phone: state.data.contactPhone.trim(),
      email: state.data.contactEmail.trim(),
    },
    deliveryWindow: {
      from: state.data.timeFrom,
      to: state.data.timeTo,
    },
  };
}

export async function submitOrderWizard(state) {
  const validation = validateAllSteps(state);
  const invalidStep = Object.entries(validation).find(([, result]) => !result.valid);

  if (invalidStep) {
    const [stepId, result] = invalidStep;
    const error = new Error(result.summary || 'The wizard is incomplete.');
    error.stepId = stepId;
    error.validation = validation;
    throw error;
  }

  return placeDeliveryOrder(buildSubmissionPayload(state));
}
