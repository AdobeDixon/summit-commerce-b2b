import {
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { EQUIPMENT_PRODUCTS, getEquipmentProductBySku } from './equipment-products.js';
import { DELIVERY_SITES, findSiteBySearchValue, getSiteSearchLabel } from './sites.js';
import {
  STEP_SEQUENCE,
  createEquipmentLine,
  createInitialState,
  getNextStep,
  getSelectedSite,
  getStepSummary,
  markStepCompleted,
} from './state.js';
import { validateStep } from './validation.js';
import { submitOrderWizard } from './submission.js';

import '../../scripts/initializers/auth.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/checkout.js';
import '../../scripts/initializers/order.js';

const STEP_TITLES = {
  orderType: '1. Order Type',
  deliveryDate: '2. Delivery Date',
  transport: '3. Transport',
  equipment: '4. Equipment',
  siteContact: '5. Site Address & Contact',
  deliveryWindow: '6. Delivery Window',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTodayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function getStepErrors(state, stepId) {
  return state.errors[stepId] || { fields: {}, summary: '' };
}

function clearStepError(state, stepId) {
  delete state.errors[stepId];
  state.submitError = '';
}

function syncSelectedSite(state) {
  const matchedSite = findSiteBySearchValue(state.data.siteSearch);
  state.data.siteId = matchedSite?.id || '';
}

function renderError(message) {
  if (!message) return '';
  return `<p class="order-new-delivery__field-error" role="alert">${escapeHtml(message)}</p>`;
}

function renderStepMessage(message) {
  if (!message) return '';
  return `
    <div class="order-new-delivery__step-message" role="alert">
      ${escapeHtml(message)}
    </div>
  `;
}

function renderRadioCard({ name, value, label, checked, stepId }) {
  return `
    <label class="order-new-delivery__choice-card">
      <input
        type="radio"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value)}"
        data-step-input="${escapeHtml(stepId)}"
        ${checked ? 'checked' : ''}
      >
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderEquipmentOptions(selectedSku) {
  return `
    <option value="">Select equipment</option>
    ${EQUIPMENT_PRODUCTS.map((product) => `
      <option value="${escapeHtml(product.sku)}" ${product.sku === selectedSku ? 'selected' : ''}>
        ${escapeHtml(product.label)}
      </option>
    `).join('')}
  `;
}

function renderEquipmentRows(state, errors) {
  return state.data.equipment.map((line, index) => `
    <div class="order-new-delivery__equipment-row">
      <div class="order-new-delivery__field">
        <label for="equipment-sku-${index}">Equipment type</label>
        <select
          id="equipment-sku-${index}"
          data-equipment-field="sku"
          data-equipment-index="${index}"
        >
          ${renderEquipmentOptions(line.sku)}
        </select>
        ${renderError(errors.fields[`equipment-${index}-sku`])}
      </div>
      <div class="order-new-delivery__field order-new-delivery__field--quantity">
        <label for="equipment-quantity-${index}">Quantity</label>
        <input
          id="equipment-quantity-${index}"
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          value="${escapeHtml(line.quantity)}"
          data-equipment-field="quantity"
          data-equipment-index="${index}"
        >
        ${renderError(errors.fields[`equipment-${index}-quantity`])}
      </div>
      <div class="order-new-delivery__equipment-actions">
        <button
          type="button"
          class="button secondary"
          data-remove-equipment="${index}"
          ${state.data.equipment.length === 1 ? 'disabled' : ''}
        >
          Remove
        </button>
      </div>
    </div>
  `).join('');
}

function renderStepBody(stepId, state, siteListId) {
  const errors = getStepErrors(state, stepId);
  const isLastStep = stepId === STEP_SEQUENCE[STEP_SEQUENCE.length - 1];

  let content = '';

  switch (stepId) {
    case 'orderType':
      content = `
        <div class="order-new-delivery__choice-grid">
          ${renderRadioCard({
            name: 'orderType',
            value: 'single',
            label: 'Single Order',
            checked: state.data.orderType === 'single',
            stepId,
          })}
          ${renderRadioCard({
            name: 'orderType',
            value: 'seven-day',
            label: '7 Day Order',
            checked: state.data.orderType === 'seven-day',
            stepId,
          })}
        </div>
        ${renderError(errors.fields.orderType)}
      `;
      break;
    case 'deliveryDate':
      content = `
        <div class="order-new-delivery__field-grid">
          <div class="order-new-delivery__field">
            <label for="delivery-date">Delivery date</label>
            <input
              id="delivery-date"
              type="date"
              min="${getTodayIsoDate()}"
              value="${escapeHtml(state.data.deliveryDate)}"
              data-field="deliveryDate"
            >
            ${renderError(errors.fields.deliveryDate)}
          </div>
          <div class="order-new-delivery__field">
            <label for="delivery-source">Source</label>
            <input
              id="delivery-source"
              type="text"
              value="${escapeHtml(state.data.source)}"
              readonly
            >
            <p class="order-new-delivery__help-text">Source is fixed as CHEP for this flow.</p>
          </div>
        </div>
      `;
      break;
    case 'transport':
      content = `
        <div class="order-new-delivery__choice-grid">
          ${renderRadioCard({
            name: 'transport',
            value: 'chep',
            label: 'CHEP',
            checked: state.data.transport === 'chep',
            stepId,
          })}
          ${renderRadioCard({
            name: 'transport',
            value: 'customer',
            label: 'Customer',
            checked: state.data.transport === 'customer',
            stepId,
          })}
        </div>
        ${renderError(errors.fields.transport)}
      `;
      break;
    case 'equipment':
      content = `
        ${renderStepMessage(errors.summary)}
        <div class="order-new-delivery__equipment-list">
          ${renderEquipmentRows(state, errors)}
        </div>
        ${renderError(errors.fields.equipment)}
        <button type="button" class="button secondary" data-add-equipment>Add equipment line</button>
      `;
      break;
    case 'siteContact':
      content = `
        ${renderStepMessage(errors.summary)}
        <div class="order-new-delivery__field-grid">
          <div class="order-new-delivery__field order-new-delivery__field--full">
            <label for="site-search">Site or location</label>
            <input
              id="site-search"
              list="${escapeHtml(siteListId)}"
              value="${escapeHtml(state.data.siteSearch)}"
              data-field="siteSearch"
              autocomplete="off"
            >
            <datalist id="${escapeHtml(siteListId)}">
              ${DELIVERY_SITES.map((site) => `<option value="${escapeHtml(getSiteSearchLabel(site))}"></option>`).join('')}
            </datalist>
            ${renderError(errors.fields.siteSearch)}
          </div>
          <div class="order-new-delivery__field">
            <label for="contact-name">Contact name</label>
            <input id="contact-name" type="text" value="${escapeHtml(state.data.contactName)}" data-field="contactName">
            ${renderError(errors.fields.contactName)}
          </div>
          <div class="order-new-delivery__field">
            <label for="contact-phone">Contact phone</label>
            <input id="contact-phone" type="tel" value="${escapeHtml(state.data.contactPhone)}" data-field="contactPhone">
            ${renderError(errors.fields.contactPhone)}
          </div>
          <div class="order-new-delivery__field order-new-delivery__field--full">
            <label for="contact-email">Contact email</label>
            <input id="contact-email" type="email" value="${escapeHtml(state.data.contactEmail)}" data-field="contactEmail">
            ${renderError(errors.fields.contactEmail)}
          </div>
        </div>
      `;
      break;
    case 'deliveryWindow':
      content = `
        ${renderStepMessage(errors.summary)}
        <div class="order-new-delivery__field-grid">
          <div class="order-new-delivery__field">
            <label for="time-from">Time from</label>
            <input id="time-from" type="time" value="${escapeHtml(state.data.timeFrom)}" data-field="timeFrom">
            ${renderError(errors.fields.timeFrom)}
          </div>
          <div class="order-new-delivery__field">
            <label for="time-to">Time to</label>
            <input id="time-to" type="time" value="${escapeHtml(state.data.timeTo)}" data-field="timeTo">
            ${renderError(errors.fields.timeTo)}
          </div>
        </div>
      `;
      break;
    default:
      content = '';
  }

  const actionButton = isLastStep
    ? `
      <button
        type="button"
        class="button order-new-delivery__primary-action"
        data-submit-order
        ${state.submitting ? 'disabled aria-disabled="true"' : ''}
      >
        ${state.submitting ? 'Placing order...' : 'Place Order'}
      </button>
    `
    : `
      <button
        type="button"
        class="button order-new-delivery__primary-action"
        data-continue-step="${escapeHtml(stepId)}"
      >
        Continue
      </button>
    `;

  return `
    ${content}
    <div class="order-new-delivery__step-actions">
      ${actionButton}
    </div>
  `;
}

function renderWizard(state, siteListId) {
  return `
    <div class="order-new-delivery__shell" ${state.submitting ? 'aria-busy="true"' : ''}>
      <div class="order-new-delivery__intro">
        <h2>Order New Delivery</h2>
        <p>Create a new B2B pallet delivery order using the authenticated Adobe Commerce customer session.</p>
      </div>
      ${state.submitError ? `<div class="order-new-delivery__form-error" role="alert">${escapeHtml(state.submitError)}</div>` : ''}
      <div class="order-new-delivery__steps">
        ${STEP_SEQUENCE.map((stepId) => {
          const isActive = state.activeStep === stepId;
          const isCompleted = state.completedSteps.includes(stepId);
          const stepTitleId = `order-new-delivery-title-${stepId}`;
          const stepPanelId = `order-new-delivery-panel-${stepId}`;
          const summary = isCompleted ? getStepSummary(stepId, state) : '';

          return `
            <section class="order-new-delivery__step ${isActive ? 'is-open' : ''} ${isCompleted ? 'is-complete' : ''}">
              <h3 class="order-new-delivery__step-title" id="${stepTitleId}">
                <button
                  type="button"
                  class="order-new-delivery__step-toggle"
                  data-open-step="${escapeHtml(stepId)}"
                  aria-expanded="${isActive ? 'true' : 'false'}"
                  aria-controls="${stepPanelId}"
                >
                  <span>${escapeHtml(STEP_TITLES[stepId])}</span>
                  ${summary ? `<span class="order-new-delivery__summary">${escapeHtml(summary)}</span>` : ''}
                </button>
              </h3>
              <div
                id="${stepPanelId}"
                class="order-new-delivery__step-panel"
                role="region"
                aria-labelledby="${stepTitleId}"
                ${isActive ? '' : 'hidden'}
              >
                ${renderStepBody(stepId, state, siteListId)}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderConfirmation(state) {
  const { order, summary } = state.submitResult;
  const site = summary.site;

  return `
    <div class="order-new-delivery__confirmation">
      <div class="order-new-delivery__confirmation-banner">
        <h2>Order placed successfully</h2>
        <p>Your Adobe Commerce order number is <strong>${escapeHtml(order.number)}</strong>.</p>
      </div>
      <div class="order-new-delivery__confirmation-grid">
        <div>
          <h3>Order details</h3>
          <p><strong>Order type:</strong> ${escapeHtml(getStepSummary('orderType', state))}</p>
          <p><strong>Delivery date:</strong> ${escapeHtml(summary.deliveryDate)}</p>
          <p><strong>Transport:</strong> ${escapeHtml(getStepSummary('transport', state))}</p>
          <p><strong>Delivery window:</strong> ${escapeHtml(`${summary.deliveryWindow.from} to ${summary.deliveryWindow.to}`)}</p>
        </div>
        <div>
          <h3>Site & contact</h3>
          <p><strong>Site:</strong> ${escapeHtml(site.name)}</p>
          <p><strong>Address:</strong> ${escapeHtml(`${site.address1}, ${site.city}, ${site.region}, ${site.postcode}, ${site.countryCode}`)}</p>
          <p><strong>Contact:</strong> ${escapeHtml(summary.contact.name)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(summary.contact.phone)}</p>
          <p><strong>Email:</strong> ${escapeHtml(summary.contact.email)}</p>
        </div>
      </div>
      <div class="order-new-delivery__confirmation-items">
        <h3>Equipment ordered</h3>
        <ul>
          ${summary.equipment.map((line) => `
            <li>
              ${escapeHtml(String(line.quantity))} x ${escapeHtml(line.product?.label || line.sku)}
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
}

function attachInputListeners(block, state) {
  block.querySelectorAll('[data-open-step]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeStep = button.dataset.openStep;
      renderBlock(block, state);
    });
  });

  block.querySelectorAll('[data-step-input="orderType"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.data.orderType = input.value;
      clearStepError(state, 'orderType');
    });
  });

  block.querySelectorAll('[data-step-input="transport"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.data.transport = input.value;
      clearStepError(state, 'transport');
    });
  });

  block.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const { field } = input.dataset;
      state.data[field] = input.value;

      if (field === 'siteSearch') {
        syncSelectedSite(state);
        clearStepError(state, 'siteContact');
      } else if (['contactName', 'contactPhone', 'contactEmail'].includes(field)) {
        clearStepError(state, 'siteContact');
      } else if (['timeFrom', 'timeTo'].includes(field)) {
        clearStepError(state, 'deliveryWindow');
      } else if (field === 'deliveryDate') {
        clearStepError(state, 'deliveryDate');
      }
    });
  });

  block.querySelectorAll('[data-equipment-index]').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.equipmentIndex);
      const field = input.dataset.equipmentField;

      if (!state.data.equipment[index]) return;
      state.data.equipment[index][field] = field === 'quantity' ? input.value : input.value;
      clearStepError(state, 'equipment');
    });
  });

  const addEquipmentButton = block.querySelector('[data-add-equipment]');
  if (addEquipmentButton) {
    addEquipmentButton.addEventListener('click', () => {
      state.data.equipment.push(createEquipmentLine());
      clearStepError(state, 'equipment');
      renderBlock(block, state);
    });
  }

  block.querySelectorAll('[data-remove-equipment]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeEquipment);
      state.data.equipment.splice(index, 1);
      clearStepError(state, 'equipment');
      renderBlock(block, state);
    });
  });

  block.querySelectorAll('[data-continue-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.dataset.continueStep;
      const validation = validateStep(stepId, state);

      if (!validation.valid) {
        state.errors[stepId] = validation;
        state.activeStep = stepId;
        renderBlock(block, state);
        return;
      }

      clearStepError(state, stepId);
      markStepCompleted(state, stepId);
      state.activeStep = getNextStep(stepId) || stepId;
      renderBlock(block, state);
    });
  });

  const submitButton = block.querySelector('[data-submit-order]');
  if (submitButton) {
    submitButton.addEventListener('click', async () => {
      if (state.submitting) return;

      state.submitting = true;
      state.submitError = '';
      renderBlock(block, state);

      try {
        state.submitResult = await submitOrderWizard(state);
        STEP_SEQUENCE.forEach((stepId) => markStepCompleted(state, stepId));
      } catch (error) {
        if (error.validation && error.stepId) {
          state.errors = error.validation;
          state.activeStep = error.stepId;
        }
        state.submitError = error.message || 'Unable to place the order.';
      } finally {
        state.submitting = false;
        renderBlock(block, state);
      }
    });
  }
}

function renderBlock(block, state) {
  if (!checkIsAuthenticated()) {
    block.innerHTML = `
      <div class="order-new-delivery__signin">
        <h2>Order New Delivery</h2>
        <p>You need an authenticated customer session before placing a delivery order.</p>
        <a class="button primary" href="${rootLink(CUSTOMER_LOGIN_PATH)}">Sign in</a>
      </div>
    `;
    return;
  }

  const siteListId = block.dataset.siteListId;

  block.innerHTML = state.submitResult
    ? renderConfirmation(state)
    : renderWizard(state, siteListId);

  if (!state.submitResult) {
    attachInputListeners(block, state);
  }
}

export default async function decorate(block) {
  block.classList.add('order-new-delivery');
  block.dataset.siteListId = `order-new-delivery-sites-${Math.random().toString(36).slice(2, 10)}`;

  const state = createInitialState();
  const selectedSite = getSelectedSite(state);

  if (selectedSite) {
    state.data.siteSearch = getSiteSearchLabel(selectedSite);
  }

  renderBlock(block, state);
}
