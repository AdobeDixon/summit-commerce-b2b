import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_ADDRESS_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { buildNav, toggleNav } from '../bodea-dashboard/dashboard-nav.js';
import { renderBrickProductIcon } from './brick-product-icon.js';
import { EQUIPMENT_PRODUCTS } from './equipment-products.js';
import { fetchEquipmentSkuPrices, formatMoneyAmount } from './equipment-prices.js';
import {
  findSiteById,
  getDeliverySites,
  getSiteSearchLabel,
  loadDeliverySitesFromAddressBook,
} from './sites.js';
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
import '../../scripts/initializers/account.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/checkout.js';
import '../../scripts/initializers/order.js';

const STEP_TITLES = {
  orderType: 'Order Type',
  deliveryDate: 'Delivery Date',
  transport: 'Transport',
  equipment: 'Products',
  siteContact: 'Site & Contact',
  deliveryWindow: 'Delivery Window',
};

const STEP_DESCRIPTIONS = {
  orderType: 'Choose between a single delivery or a 7-day recurring order.',
  deliveryDate: 'Select the date your brick packs need to be delivered.',
  transport: 'Choose Bodea delivery or your own fleet.',
  equipment: 'Select brick lines and pack quantities for your order.',
  siteContact: 'Specify the delivery address and on-site contact details.',
  deliveryWindow: 'Set your preferred delivery time window for the driver.',
};

/* ------------------------------------------------------------------
   Utility helpers
   ------------------------------------------------------------------ */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStepErrors(state, stepId) {
  return state.errors[stepId] || { fields: {}, summary: '' };
}

function clearStepError(state, stepId) {
  delete state.errors[stepId];
  state.submitError = '';
}


/* ------------------------------------------------------------------
   SVG icons
   ------------------------------------------------------------------ */
function renderCheckIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderArrowIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ------------------------------------------------------------------
   Calendar date picker
   ------------------------------------------------------------------ */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function renderChevronLeft() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>`;
}
function renderChevronRight() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>`;
}
function renderChevronUp() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l5-5 5 5"/></svg>`;
}
function renderChevronDown() {
  return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l5 5 5-5"/></svg>`;
}

function renderCalendar(state, errors) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = state.data.deliveryDate
    ? new Date(`${state.data.deliveryDate}T00:00:00`)
    : null;

  const dispYear = state.ui?.calendarYear ?? (selected?.getFullYear() ?? today.getFullYear());
  const dispMonth = state.ui?.calendarMonth ?? (selected?.getMonth() ?? today.getMonth());

  const firstOfMonth = new Date(dispYear, dispMonth, 1);
  const daysInMonth = new Date(dispYear, dispMonth + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first

  const prevM = dispMonth === 0 ? 11 : dispMonth - 1;
  const prevY = dispMonth === 0 ? dispYear - 1 : dispYear;
  const nextM = dispMonth === 11 ? 0 : dispMonth + 1;
  const nextY = dispMonth === 11 ? dispYear + 1 : dispYear;

  const canGoPrev = dispYear > today.getFullYear()
    || (dispYear === today.getFullYear() && dispMonth > today.getMonth());

  const dowHeaders = DAY_ABBR.map((d) => `<span class="ond-cal__dow">${d}</span>`).join('');
  const emptyCells = Array.from({ length: startOffset }, () => '<span class="ond-cal__day ond-cal__day--empty"></span>').join('');

  const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const thisDate = new Date(dispYear, dispMonth, dayNum);
    const isPast = thisDate < today;
    const isToday = thisDate.getTime() === today.getTime();
    const isSelected = selected
      && thisDate.getFullYear() === selected.getFullYear()
      && thisDate.getMonth() === selected.getMonth()
      && thisDate.getDate() === selected.getDate();

    const cls = ['ond-cal__day', isToday && 'is-today', isSelected && 'is-selected'].filter(Boolean).join(' ');
    const mo = String(dispMonth + 1).padStart(2, '0');
    const dy = String(dayNum).padStart(2, '0');

    return `<button
      type="button"
      class="${cls}"
      data-cal-date="${dispYear}-${mo}-${dy}"
      aria-label="${dayNum} ${MONTH_NAMES[dispMonth]} ${dispYear}${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}"
      aria-pressed="${isSelected ? 'true' : 'false'}"
      ${isPast ? 'disabled' : ''}
    >${dayNum}</button>`;
  }).join('');

  const selectedLabel = selected
    ? `<p class="ond-cal__selected-label">
        Selected: <strong>${selected.getDate()} ${MONTH_NAMES[selected.getMonth()]} ${selected.getFullYear()}</strong>
       </p>`
    : '';

  return `
    <div class="ond-calendar">
      <div class="ond-cal__header">
        <button type="button" class="ond-cal__nav-btn" data-cal-nav-year="${prevY}" data-cal-nav-month="${prevM}" aria-label="Previous month" ${!canGoPrev ? 'disabled' : ''}>
          ${renderChevronLeft()}
        </button>
        <span class="ond-cal__month-label" aria-live="polite">${MONTH_NAMES[dispMonth]} ${dispYear}</span>
        <button type="button" class="ond-cal__nav-btn" data-cal-nav-year="${nextY}" data-cal-nav-month="${nextM}" aria-label="Next month">
          ${renderChevronRight()}
        </button>
      </div>
      <div class="ond-cal__grid">
        ${dowHeaders}
        ${emptyCells}
        ${dayCells}
      </div>
    </div>
    ${selectedLabel}
    ${renderError(errors.fields.deliveryDate)}
  `;
}

/* ------------------------------------------------------------------
   Time stepper
   ------------------------------------------------------------------ */
function renderTimeStepper(value, fieldName, ariaLabel) {
  const hasParts = value && value.includes(':');
  const h = hasParts ? Number(value.split(':')[0]) : null;
  const m = hasParts ? Number(value.split(':')[1]) : null;
  const dispH = h !== null ? String(h).padStart(2, '0') : '––';
  const dispM = m !== null ? String(m).padStart(2, '0') : '––';
  const isEmpty = h === null;

  return `
    <div class="ond-time-stepper" aria-label="${escapeHtml(ariaLabel)}">
      <div class="ond-time-col">
        <button type="button" class="ond-time-arrow" data-time-step="1" data-time-field="${escapeHtml(fieldName)}" data-time-part="hour" aria-label="Increase hour">
          ${renderChevronUp()}
        </button>
        <div class="ond-time-display${isEmpty ? ' is-placeholder' : ''}">${dispH}</div>
        <button type="button" class="ond-time-arrow" data-time-step="-1" data-time-field="${escapeHtml(fieldName)}" data-time-part="hour" aria-label="Decrease hour">
          ${renderChevronDown()}
        </button>
        <div class="ond-time-unit">hr</div>
      </div>
      <div class="ond-time-sep-col"><span class="ond-time-colon" aria-hidden="true">:</span></div>
      <div class="ond-time-col">
        <button type="button" class="ond-time-arrow" data-time-step="1" data-time-field="${escapeHtml(fieldName)}" data-time-part="minute" aria-label="Increase minute">
          ${renderChevronUp()}
        </button>
        <div class="ond-time-display${isEmpty ? ' is-placeholder' : ''}">${dispM}</div>
        <button type="button" class="ond-time-arrow" data-time-step="-1" data-time-field="${escapeHtml(fieldName)}" data-time-part="minute" aria-label="Decrease minute">
          ${renderChevronDown()}
        </button>
        <div class="ond-time-unit">min</div>
      </div>
    </div>
  `;
}

function formatSiteType(type) {
  return type.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function renderSiteCards(state, errors) {
  const sites = getDeliverySites();

  if (!sites.length) {
    return `
      <div class="ond-site-empty" role="status">
        <p class="ond-site-empty__title">No saved delivery addresses</p>
        <p class="ond-site-empty__text">
          Add one or more addresses in your account address book, then refresh this page.
        </p>
        <a class="button primary ond-site-empty__cta" href="${rootLink(CUSTOMER_ADDRESS_PATH)}">
          Manage address book
        </a>
      </div>
      ${renderError(errors.fields.siteSearch)}
    `;
  }

  const cards = sites.map((site) => {
    const isSelected = state.data.siteId === site.id;
    const address = [site.address1, site.city, site.postcode].filter(Boolean).join(', ');

    return `
      <label class="ond-site-card${isSelected ? ' is-selected' : ''}">
        <input
          type="radio"
          name="siteId"
          value="${escapeHtml(site.id)}"
          data-site-id="${escapeHtml(site.id)}"
          ${isSelected ? 'checked' : ''}
        >
        <span class="ond-site-card__check" aria-hidden="true">
          ${isSelected ? renderCheckIcon() : ''}
        </span>
        <span class="ond-site-card__info">
          <span class="ond-site-card__name">${escapeHtml(site.name)}</span>
          <span class="ond-site-card__address">${escapeHtml(address)}</span>
          <span class="ond-site-card__type">${escapeHtml(formatSiteType(site.type))}</span>
        </span>
      </label>
    `;
  }).join('');

  return `
    <div class="ond-site-grid" role="radiogroup" aria-label="Select delivery site">
      ${cards}
    </div>
    ${renderError(errors.fields.siteSearch)}
  `;
}

/* ------------------------------------------------------------------
   Shared render helpers
   ------------------------------------------------------------------ */
function renderError(message) {
  if (!message) return '';
  return `<p class="ond-field-error" role="alert">${escapeHtml(message)}</p>`;
}

function renderStepMessage(message) {
  if (!message) return '';
  return `<div class="ond-step-message" role="alert">${escapeHtml(message)}</div>`;
}

function renderChoiceCard({ name, value, label, checked, stepId }) {
  return `
    <label class="ond-choice-card">
      <input
        type="radio"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value)}"
        data-step-input="${escapeHtml(stepId)}"
        ${checked ? 'checked' : ''}
      >
      <span class="ond-choice-card__label">${escapeHtml(label)}</span>
    </label>
  `;
}

/* ------------------------------------------------------------------
   Truck capacity estimation (~26 pack spaces per UK 13.6m trailer)
   ------------------------------------------------------------------ */
const PACK_SPACES_PER_TRAILER = 26;

/**
 * Calculates estimated truck capacity metrics from equipment quantities.
 * @param {Object} state - Wizard state with data.equipment
 * @returns {{ totalPackUnits: number, truckCountEstimate: number, fullTruckCount: number, lastTruckPercent: number }}
 */
function calculateTruckCapacity(state) {
  const totalPackUnits = (state.data.equipment || [])
    .filter((l) => l.sku && l.sku !== '')
    .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  const truckCountEstimate = totalPackUnits > 0
    ? Math.ceil(totalPackUnits / PACK_SPACES_PER_TRAILER)
    : 0;

  const remainder = totalPackUnits % PACK_SPACES_PER_TRAILER;
  const fullTruckCount = remainder === 0 && totalPackUnits > 0
    ? truckCountEstimate
    : Math.floor(totalPackUnits / PACK_SPACES_PER_TRAILER);
  const lastTruckPallets = remainder === 0 ? PACK_SPACES_PER_TRAILER : remainder;
  const lastTruckPercent = Math.round((lastTruckPallets / PACK_SPACES_PER_TRAILER) * 100);

  return { totalPackUnits, truckCountEstimate, fullTruckCount, lastTruckPercent };
}

/**
 * Returns a state class for the capacity card based on fill percentage (per truck).
 * 0–50% = calm, 51–85% = healthy, 86–100% = near-full, >1 truck = overflow
 */
function getCapacityStateClass(lastTruckPercent, truckCount) {
  if (truckCount <= 0) return 'ond-capacity--empty';
  if (truckCount > 1) return 'ond-capacity--overflow';
  if (lastTruckPercent <= 50) return 'ond-capacity--calm';
  if (lastTruckPercent <= 85) return 'ond-capacity--healthy';
  return 'ond-capacity--near-full';
}

/* Trailer fill bounds (corrected for this truck PNG):
 * fill starts 26%, ends 91% → max fillable width = 65%
 * visibleFillWidth = fillRatio × 65% of image width
 */
const FILL_LEFT_PCT = 26;
const FILL_MAX_WIDTH_PCT = 65; /* 91 - 26 */

const TRUCK_CAPACITY_IMG = '/images/truck-capacity.png';

/** Decorative KPI icons (stroke weight matches wizard chevrons ~2px); truck PNGs are separate. */
const OND_CAPACITY_ICON_PACK = (
  '<svg class="ond-capacity__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
  + 'fill="none" aria-hidden="true">'
  + '<path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
  + 'd="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 '
  + '11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 '
  + '0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>'
);
const OND_CAPACITY_ICON_UTIL = (
  '<svg class="ond-capacity__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
  + 'fill="none" aria-hidden="true">'
  + '<path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
  + 'd="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 '
  + '6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 '
  + '1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 '
  + '4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 '
  + '1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>'
);
const OND_CAPACITY_ICON_FLEET = (
  '<svg class="ond-capacity__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" '
  + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
  + 'aria-hidden="true">'
  + '<rect x="1" y="3" width="15" height="13" rx="1"/>'
  + '<path d="M16 8h4l3 5v3h-7V8z"/>'
  + '<circle cx="5.5" cy="18.5" r="2.5"/>'
  + '<circle cx="18.5" cy="18.5" r="2.5"/>'
  + '</svg>'
);

/**
 * Truck capacity visual: PNG foreground, blue fill behind (through transparent trailer).
 * Fill bounds: 26%–91% horizontal.
 */
function renderTruckCapacityVisual(totalPackUnits) {
  const truckCount = Math.ceil(totalPackUnits / PACK_SPACES_PER_TRAILER) || 1;

  const trucks = [];
  for (let t = 0; t < truckCount; t++) {
    const packsForTruck = Math.min(PACK_SPACES_PER_TRAILER, Math.max(0, totalPackUnits - t * PACK_SPACES_PER_TRAILER));
    const capacityRatio = Math.min(1, packsForTruck / PACK_SPACES_PER_TRAILER);
    trucks.push(renderTruckWithFill(t, capacityRatio));
  }

  return `
    <div class="ond-capacity__truck-visual" role="img" aria-label="Truck capacity: ${totalPackUnits} pack units across ${truckCount} truck${truckCount > 1 ? 's' : ''}">
      <div class="ond-capacity__trucks">
        ${trucks.join('')}
      </div>
    </div>
  `;
}

/**
 * Renders one truck: PNG foreground (z-index 2), blue fill behind (z-index 1).
 * visibleFillWidth = min(packs/26, 1) × 65% of image width.
 */
function renderTruckWithFill(truckIndex, capacityRatio) {
  const ratio = Math.min(1, Math.max(0, capacityRatio));
  const fillWidthPct = ratio * FILL_MAX_WIDTH_PCT;
  return `
    <div class="ond-capacity__truck truck-capacity-wrapper" data-truck-index="${truckIndex}">
      <div class="truck-capacity-void"></div>
      <div class="truck-capacity-fill" style="--fill-width-pct: ${fillWidthPct};"></div>
      <img class="truck-capacity-image" src="${TRUCK_CAPACITY_IMG}" alt="" width="1024" height="400" />
    </div>
  `;
}

/**
 * @param {string} iconSvg - Static SVG only (from OND_CAPACITY_ICON_*).
 */
function renderCapacityMetric(iconSvg, label, figure, hint) {
  return `
    <div class="ond-capacity__stat">
      <div class="ond-capacity__stat-head">
        <span class="ond-capacity__stat-icon-wrap" aria-hidden="true">${iconSvg}</span>
        <span class="ond-capacity__stat-label">${escapeHtml(label)}</span>
      </div>
      <div class="ond-capacity__stat-body">
        <span class="ond-capacity__stat-figure">${escapeHtml(figure)}</span>
        <span class="ond-capacity__stat-hint">${escapeHtml(hint)}</span>
      </div>
    </div>
  `;
}

function renderCapacityCard(state) {
  const { totalPackUnits, truckCountEstimate, fullTruckCount, lastTruckPercent } = calculateTruckCapacity(state);
  const stateClass = getCapacityStateClass(lastTruckPercent, truckCountEstimate);
  const isEmpty = totalPackUnits === 0;

  if (isEmpty) {
    return `
      <div class="ond-capacity ond-capacity--empty" data-capacity-card>
        <h4 class="ond-capacity__title">Estimated truck capacity</h4>
        <p class="ond-capacity__copy">Based on a standard trailer with roughly ${PACK_SPACES_PER_TRAILER} pack spaces.</p>
        <div class="ond-capacity__empty-state">
          <p class="ond-capacity__empty-text">Add products to estimate delivery vehicle capacity.</p>
        </div>
      </div>
    `;
  }

  const spacesLabel = 'Pack units';
  const spacesFigure = String(totalPackUnits);
  const spacesHint = `${PACK_SPACES_PER_TRAILER} / trailer`;

  const capLabel = 'Utilisation';
  let capFigure;
  let capHint;
  if (truckCountEstimate === 1) {
    capFigure = `${lastTruckPercent}%`;
    capHint = 'Single trailer';
  } else if (fullTruckCount === truckCountEstimate) {
    capFigure = `${fullTruckCount} × full`;
    capHint = 'All trailers full';
  } else {
    const partialCount = truckCountEstimate - fullTruckCount;
    capFigure = fullTruckCount > 0
      ? `${fullTruckCount} full · ${partialCount} at ${lastTruckPercent}%`
      : `${lastTruckPercent}%`;
    capHint = fullTruckCount > 0
      ? 'Split load'
      : 'Single trailer';
  }

  const fleetLabel = 'Trailers';
  const fleetFigure = String(truckCountEstimate);
  const fleetHint = 'Indicative · non-binding';

  return `
    <div class="ond-capacity ${stateClass}" data-capacity-card>
      <h4 class="ond-capacity__title">Estimated truck capacity</h4>
      <p class="ond-capacity__copy">Based on a standard trailer with roughly ${PACK_SPACES_PER_TRAILER} pack spaces.</p>
      ${renderTruckCapacityVisual(totalPackUnits)}
      <div class="ond-capacity__metrics" role="group" aria-label="Capacity summary">
        ${renderCapacityMetric(OND_CAPACITY_ICON_PACK, spacesLabel, spacesFigure, spacesHint)}
        ${renderCapacityMetric(OND_CAPACITY_ICON_UTIL, capLabel, capFigure, capHint)}
        ${renderCapacityMetric(OND_CAPACITY_ICON_FLEET, fleetLabel, fleetFigure, fleetHint)}
      </div>
    </div>
  `;
}

/**
 * Patches only the capacity card DOM when equipment quantities change.
 * Used for live updates without full step re-render.
 */
function patchCapacityCard(block, state) {
  const card = block?.querySelector('[data-capacity-card]');
  if (!card) return;

  const parent = card.parentElement;
  if (!parent) return;

  const newCard = document.createElement('div');
  newCard.innerHTML = renderCapacityCard(state).trim();
  const newCardEl = newCard.firstElementChild;
  if (newCardEl) {
    parent.replaceChild(newCardEl, card);
  }
}

/**
 * Patches the live subtotal strip (below product grid). Keeps totals in sync without a full
 * wizard re-render when quantities change.
 */
function patchEquipmentSubtotalBar(block, state) {
  const el = block?.querySelector('[data-equipment-subtotal-bar]');
  if (!el) return;
  const d = document.createElement('div');
  d.innerHTML = renderEquipmentSubtotalBar(state).trim();
  const next = d.firstElementChild;
  if (next) {
    el.replaceWith(next);
  }
}

function patchEquipmentStepLiveUi(block, state) {
  patchEquipmentSubtotalBar(block, state);
  patchCapacityCard(block, state);
}

/* ------------------------------------------------------------------
   Equipment product cards
   ------------------------------------------------------------------ */
function getEquipmentQuantity(state, sku) {
  const line = state.data.equipment.find((l) => l.sku === sku);
  return line ? Number(line.quantity) : 0;
}

/**
 * Sum of unit price × qty for lines with catalog prices. Omits unpriced SKUs; sets hasGaps when
 * some selected lines have no price.
 * @returns {{ value: number, currency: string, hasGaps: boolean } | null}
 */
function getEquipmentSubtotal(state) {
  const priceBySku = state.ui?.equipmentPrices;
  if (!priceBySku || !state.ui?.equipmentPricesLoaded) {
    return null;
  }

  const lines = (state.data.equipment || []).filter((l) => l.sku && Number(l.quantity) > 0);
  if (!lines.length) {
    return null;
  }

  let total = 0;
  let currency = '';
  let pricedCount = 0;

  lines.forEach((line) => {
    const p = priceBySku[line.sku];
    if (p && typeof p.value === 'number') {
      total += p.value * Number(line.quantity);
      currency = p.currency || currency;
      pricedCount += 1;
    }
  });

  if (pricedCount === 0) {
    return null;
  }

  return {
    value: total,
    currency,
    hasGaps: pricedCount < lines.length,
  };
}

function renderEquipmentSubtotalBar(state) {
  const fineprint = 'Excludes delivery and taxes; final amount at checkout.';

  if (!state.ui?.equipmentPricesLoaded) {
    return `
      <div class="ond-equipment-subtotal" data-equipment-subtotal-bar aria-live="polite">
        <p class="ond-equipment-subtotal__status">Loading prices…</p>
      </div>
    `;
  }

  const lines = (state.data.equipment || []).filter((l) => l.sku && Number(l.quantity) > 0);
  const sub = getEquipmentSubtotal(state);

  if (!lines.length) {
    return `
      <div class="ond-equipment-subtotal ond-equipment-subtotal--empty" data-equipment-subtotal-bar aria-live="polite">
        <p class="ond-equipment-subtotal__hint">Add pack quantities to see an estimated subtotal.</p>
      </div>
    `;
  }

  if (!sub) {
    return `
      <div class="ond-equipment-subtotal ond-equipment-subtotal--muted" data-equipment-subtotal-bar aria-live="polite">
        <p class="ond-equipment-subtotal__empty">Subtotal unavailable — list prices are missing for the packs you selected.</p>
      </div>
    `;
  }

  const gapNote = sub.hasGaps
    ? '<p class="ond-equipment-subtotal__gap">Some lines are excluded (no list price).</p>'
    : '';

  return `
    <div class="ond-equipment-subtotal" data-equipment-subtotal-bar role="region" aria-label="Estimated subtotal" aria-live="polite">
      <div class="ond-equipment-subtotal__row">
        <span class="ond-equipment-subtotal__label">Estimated subtotal</span>
        <span class="ond-equipment-subtotal__value">${escapeHtml(formatMoneyAmount(sub.value, sub.currency))}</span>
      </div>
      <p class="ond-equipment-subtotal__fineprint">${escapeHtml(fineprint)}</p>
      ${gapNote}
    </div>
  `;
}

function renderEquipmentUnitPrice(state, sku) {
  if (!state.ui?.equipmentPricesLoaded) {
    return '';
  }
  const p = state.ui?.equipmentPrices?.[sku];
  if (p && typeof p.value === 'number') {
    const formatted = formatMoneyAmount(p.value, p.currency);
    return (
      '<div class="ond-equipment-card__price">'
      + `<span class="ond-equipment-card__unit">${escapeHtml(formatted)}</span>`
      + ' <span class="ond-equipment-card__per">/ pack</span></div>'
    );
  }
  return '<div class="ond-equipment-card__price ond-equipment-card__price--muted">Price unavailable</div>';
}

function formatMaterial(material) {
  if (material === 'clay-facing') return 'Facing brick';
  if (material === 'clay-engineering') return 'Engineering brick';
  if (material === 'concrete') return 'Concrete / CMU';
  if (material === 'clay-common') return 'Common brick';
  if (material === 'clay-perf') return 'Perforated brick';
  if (material === 'vent') return 'Air brick';
  return material;
}

function renderEquipmentCards(state, errors) {
  const cards = EQUIPMENT_PRODUCTS.map((product) => {
    const qty = getEquipmentQuantity(state, product.sku);
    const isSelected = qty > 0;
    const shortName = product.label;
    const priceRow = renderEquipmentUnitPrice(state, product.sku);

    return `
      <div class="ond-equipment-card${isSelected ? ' is-selected' : ''}">
        <div class="ond-equipment-card__top">
          <div class="ond-equipment-card__icon">
            ${renderBrickProductIcon(product.material)}
          </div>
          <div class="ond-equipment-card__info">
            <div class="ond-equipment-card__name">${escapeHtml(shortName)}</div>
            <span class="ond-equipment-card__material">${escapeHtml(formatMaterial(product.material))}</span>
            ${priceRow}
          </div>
        </div>
        <div class="ond-equipment-card__footer">
          <span class="ond-qty-label">Qty</span>
          <div class="ond-qty-controls">
            <button
              type="button"
              class="ond-qty-btn"
              data-qty-change="-1"
              data-qty-sku="${escapeHtml(product.sku)}"
              aria-label="Decrease quantity for ${escapeHtml(shortName)}"
              ${qty === 0 ? 'disabled' : ''}
            >−</button>
            <input
              type="number"
              class="ond-qty-value"
              data-qty-sku="${escapeHtml(product.sku)}"
              value="${qty}"
              min="0"
              step="1"
              aria-label="Quantity for ${escapeHtml(shortName)}"
              inputmode="numeric"
            >
            <button
              type="button"
              class="ond-qty-btn"
              data-qty-change="1"
              data-qty-sku="${escapeHtml(product.sku)}"
              aria-label="Increase quantity for ${escapeHtml(shortName)}"
            >+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="ond-equipment-grid">${cards}</div>
    ${renderError(errors.fields.equipment)}
  `;
}

/* ------------------------------------------------------------------
   Step progress indicator
   ------------------------------------------------------------------ */
function renderStepProgressIndicator(state) {
  const items = STEP_SEQUENCE.map((stepId, index) => {
    const isCompleted = state.completedSteps.includes(stepId);
    const isActive = state.activeStep === stepId;
    let stateClass = '';
    if (isCompleted) stateClass = 'is-complete';
    else if (isActive) stateClass = 'is-active';

    const dotContent = isCompleted ? renderCheckIcon() : String(index + 1);
    const connector = index < STEP_SEQUENCE.length - 1
      ? '<div class="ond-progress__connector"></div>'
      : '';

    return `
      <div class="ond-progress__item${stateClass ? ` ${stateClass}` : ''}">
        <div class="ond-progress__dot" aria-hidden="true">${dotContent}</div>
        <span class="ond-progress__label">${escapeHtml(STEP_TITLES[stepId])}</span>
      </div>
      ${connector}
    `;
  }).join('');

  return `
    <nav class="ond-progress" aria-label="Order steps">
      <div class="ond-progress__track">${items}</div>
    </nav>
  `;
}

/* ------------------------------------------------------------------
   Step body content per step
   ------------------------------------------------------------------ */
function renderStepBody(stepId, state, siteListId) {
  const errors = getStepErrors(state, stepId);
  const isLastStep = stepId === STEP_SEQUENCE[STEP_SEQUENCE.length - 1];

  let content = '';

  switch (stepId) {
    case 'orderType':
      content = `
        <div class="ond-choice-grid">
          ${renderChoiceCard({
            name: 'orderType',
            value: 'single',
            label: 'Single Order',
            checked: state.data.orderType === 'single',
            stepId,
          })}
          ${renderChoiceCard({
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
        <div class="ond-date-layout">
          <div>
            ${renderCalendar(state, errors)}
          </div>
          <div class="ond-field">
            <label for="delivery-source">Source</label>
            <input id="delivery-source" type="text" value="${escapeHtml(state.data.source)}" readonly>
            <p class="ond-help-text">Source is fixed as Bodea for this flow.</p>
          </div>
        </div>
      `;
      break;

    case 'transport':
      content = `
        <div class="ond-choice-grid">
          ${renderChoiceCard({
            name: 'transport',
            value: 'chep',
            label: 'Bodea delivery',
            checked: state.data.transport === 'chep',
            stepId,
          })}
          ${renderChoiceCard({
            name: 'transport',
            value: 'customer',
            label: 'Own fleet / pickup',
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
        ${renderEquipmentCards(state, errors)}
        ${renderEquipmentSubtotalBar(state)}
        ${renderCapacityCard(state)}
      `;
      break;

    case 'siteContact':
      content = `
        ${renderStepMessage(errors.summary)}
        <div class="ond-site-section">
          <p class="ond-site-section-label">Delivery site</p>
          ${renderSiteCards(state, errors)}
        </div>
        <div class="ond-field-grid">
          <div class="ond-field">
            <label for="contact-name">Contact name</label>
            <input id="contact-name" type="text" value="${escapeHtml(state.data.contactName)}" data-field="contactName" placeholder="Full name">
            ${renderError(errors.fields.contactName)}
          </div>
          <div class="ond-field">
            <label for="contact-phone">Contact phone</label>
            <input id="contact-phone" type="tel" value="${escapeHtml(state.data.contactPhone)}" data-field="contactPhone" placeholder="+44…">
            ${renderError(errors.fields.contactPhone)}
          </div>
          <div class="ond-field ond-field--full">
            <label for="contact-email">Contact email</label>
            <input id="contact-email" type="email" value="${escapeHtml(state.data.contactEmail)}" data-field="contactEmail" placeholder="name@company.com">
            ${renderError(errors.fields.contactEmail)}
          </div>
        </div>
      `;
      break;

    case 'deliveryWindow':
      content = `
        ${renderStepMessage(errors.summary)}
        <div class="ond-time-layout">
          <div class="ond-time-slot">
            <p class="ond-time-slot__label">Earliest time</p>
            ${renderTimeStepper(state.data.timeFrom, 'timeFrom', 'Earliest delivery time')}
            ${renderError(errors.fields.timeFrom)}
          </div>
          <div class="ond-time-layout__sep" aria-hidden="true">to</div>
          <div class="ond-time-slot">
            <p class="ond-time-slot__label">Latest time</p>
            ${renderTimeStepper(state.data.timeTo, 'timeTo', 'Latest delivery time')}
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
        class="ond-btn-primary"
        data-submit-order
        ${state.submitting ? 'disabled aria-disabled="true"' : ''}
      >
        ${state.submitting ? 'Placing order…' : `Place Order ${renderArrowIcon()}`}
      </button>
    `
    : `
      <button
        type="button"
        class="ond-btn-primary"
        data-continue-step="${escapeHtml(stepId)}"
      >
        Continue ${renderArrowIcon()}
      </button>
    `;

  return `
    <p class="ond-step__description">${escapeHtml(STEP_DESCRIPTIONS[stepId])}</p>
    ${content}
    <div class="ond-step-actions">
      ${actionButton}
    </div>
  `;
}

/* ------------------------------------------------------------------
   Wizard shell
   ------------------------------------------------------------------ */
function renderWizard(state, siteListId) {
  const stepCards = STEP_SEQUENCE.map((stepId, index) => {
    const isActive = state.activeStep === stepId;
    const isCompleted = state.completedSteps.includes(stepId);
    const isUpcoming = !isActive && !isCompleted;
    const stepNumber = index + 1;
    const stepTitleId = `ond-title-${stepId}`;
    const stepPanelId = `ond-panel-${stepId}`;
    const summary = isCompleted ? getStepSummary(stepId, state) : '';

    let stateClass = '';
    if (isActive) stateClass = 'is-active';
    else if (isCompleted) stateClass = 'is-complete';
    else stateClass = 'is-upcoming';

    const badgeContent = isCompleted ? renderCheckIcon() : String(stepNumber);

    return `
      <section
        class="ond-step ${stateClass}"
        data-step-id="${escapeHtml(stepId)}"
        aria-labelledby="${stepTitleId}"
      >
        <h3 class="ond-step__heading" id="${stepTitleId}">
          <button
            type="button"
            class="ond-step__header"
            data-open-step="${escapeHtml(stepId)}"
            aria-expanded="${isActive ? 'true' : 'false'}"
            aria-controls="${stepPanelId}"
            ${isUpcoming ? 'disabled aria-disabled="true"' : ''}
          >
            <span class="ond-step__badge" aria-hidden="true">${badgeContent}</span>
            <span class="ond-step__meta">
              <span class="ond-step__title">${escapeHtml(STEP_TITLES[stepId])}</span>
              ${summary ? `<span class="ond-step__summary">${escapeHtml(summary)}</span>` : ''}
            </span>
            ${isCompleted ? '<span class="ond-step__edit-hint">Edit</span>' : ''}
          </button>
        </h3>
        <div
          id="${stepPanelId}"
          class="ond-step__panel"
          role="region"
          aria-labelledby="${stepTitleId}"
          ${isActive ? '' : 'hidden'}
        >
          ${renderStepBody(stepId, state, siteListId)}
        </div>
      </section>
    `;
  }).join('');

  return `
    <div class="ond-page-header">
      <h2>Order New Delivery</h2>
      <p>Create a new B2B masonry delivery order for Bodea brick packs via your account.</p>
    </div>
    ${state.submitError ? `<div class="ond-form-error" role="alert">${escapeHtml(state.submitError)}</div>` : ''}
    ${renderStepProgressIndicator(state)}
    <div class="ond-steps" ${state.submitting ? 'aria-busy="true"' : ''}>
      ${stepCards}
    </div>
  `;
}

/* ------------------------------------------------------------------
   Confirmation screen
   ------------------------------------------------------------------ */
function findOrderItemBySku(order, sku) {
  if (!order?.items?.length || !sku) {
    return null;
  }
  return order.items.find(
    (it) => it.productSku === sku || it.product_sku === sku,
  );
}

function formatOrderMoneyField(m) {
  if (!m || m.value == null || !m.currency) {
    return '';
  }
  return formatMoneyAmount(Number(m.value), m.currency);
}

function getPlacedOrderLineMoney(oi) {
  if (!oi) {
    return null;
  }
  const t = oi.total;
  if (t?.value != null && t.currency) {
    return t;
  }
  const ti = oi.totalInclTax;
  if (ti?.value != null && ti.currency) {
    return ti;
  }
  return null;
}

/** Prefer Commerce-placed line totals; fall back to catalog estimate from the wizard. */
function renderConfirmationLinePrice(line, order, catalogUnit) {
  const oi = findOrderItemBySku(order, line.sku);
  const placed = getPlacedOrderLineMoney(oi);
  if (placed?.value != null && placed.currency) {
    return {
      text: formatMoneyAmount(Number(placed.value), placed.currency),
      source: 'order',
    };
  }
  if (catalogUnit && typeof catalogUnit.value === 'number') {
    return {
      text: formatMoneyAmount(
        catalogUnit.value * Number(line.quantity),
        catalogUnit.currency,
      ),
      source: 'estimate',
    };
  }
  return { text: '', source: '' };
}

function renderPaymentSummaryCard(order) {
  if (!order) {
    return '';
  }

  const grand = order.grandTotal;
  const subIn = order.subtotalInclTax;
  const subEx = order.subtotalExclTax;
  const tax = order.totalTax;
  let shipMoney = order.totalShipping;
  if (!shipMoney?.value && order.shipping && typeof order.shipping === 'object') {
    const s = order.shipping;
    if (s.amount != null && (s.currency || grand?.currency)) {
      shipMoney = { value: s.amount, currency: s.currency || grand?.currency };
    }
  }

  const rows = [];
  if (subIn?.value != null) {
    rows.push({ label: 'Subtotal', value: formatOrderMoneyField(subIn) });
  } else if (subEx?.value != null) {
    rows.push({ label: 'Subtotal (ex. tax)', value: formatOrderMoneyField(subEx) });
  }
  if (shipMoney?.value != null && formatOrderMoneyField(shipMoney)) {
    rows.push({ label: 'Shipping', value: formatOrderMoneyField(shipMoney) });
  }
  if (tax?.value != null && Number(tax.value) > 0) {
    rows.push({ label: 'Tax', value: formatOrderMoneyField(tax) });
  }

  const grandStr = formatOrderMoneyField(grand);
  const detailRows = rows.filter((r) => r.value).map(
    (r) => `
      <div class="ond-detail-row">
        <span class="ond-detail-label">${escapeHtml(r.label)}</span>
        <span class="ond-detail-value">${escapeHtml(r.value)}</span>
      </div>
    `,
  ).join('');

  if (!detailRows && !grandStr) {
    return '';
  }

  const grandRow = grandStr
    ? `
      <div class="ond-detail-row ond-detail-row--grand-total">
        <span class="ond-detail-label">Order total</span>
        <span class="ond-detail-value">${escapeHtml(grandStr)}</span>
      </div>
    `
    : '';

  return `
    <div class="ond-confirmation__payment-wrap">
      <div class="ond-detail-card ond-detail-card--payment">
        <h3>Payment summary</h3>
        ${detailRows}
        ${grandRow}
      </div>
    </div>
  `;
}

function renderConfirmation(state) {
  const {
    submitResult: {
      order,
      summary: {
        site,
        equipment: summaryEquipment,
        deliveryDate,
        deliveryWindow,
        contact,
      },
    },
  } = state;
  const address = [site.address1, site.city, site.region, site.postcode, site.countryCode]
    .filter(Boolean)
    .join(', ');

  const equipmentItems = summaryEquipment
    .filter((line) => line.sku && Number(line.quantity) > 0)
    .map((line) => {
      const catalog = state.ui?.equipmentPrices?.[line.sku];
      const priced = renderConfirmationLinePrice(line, order, catalog);
      const priceClass = priced.source === 'order'
        ? 'ond-equipment-summary__line-price ond-equipment-summary__line-price--placed'
        : 'ond-equipment-summary__line-price';
      const priceCol = priced.text
        ? `<span class="${priceClass}">${escapeHtml(priced.text)}</span>`
        : '';
      return `
      <li class="ond-equipment-summary__row">
        <span class="ond-equipment-summary__main">
          <span class="ond-equipment-summary__qty">${escapeHtml(String(line.quantity))} ×</span>
          ${escapeHtml(line.product?.label || line.sku)}
        </span>
        ${priceCol}
      </li>
    `;
    })
    .join('');

  const paymentSummaryHtml = renderPaymentSummaryCard(order);

  return `
    <div class="ond-confirmation">
      <div class="ond-confirmation__success">
        <div class="ond-confirmation__icon">
          ${renderCheckIcon()}
        </div>
        <h2>Order Submitted</h2>
        <div class="ond-order-number-badge">
          Order #${escapeHtml(order.number)}
        </div>
        <p class="ond-confirmation__tagline">Your delivery order has been placed successfully. You will receive a confirmation email shortly.</p>
      </div>

      <div class="ond-confirmation__details">
        <div class="ond-detail-card">
          <h3>Order details</h3>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Order type</span>
            <span class="ond-detail-value">${escapeHtml(getStepSummary('orderType', state))}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Delivery date</span>
            <span class="ond-detail-value">${escapeHtml(deliveryDate)}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Transport</span>
            <span class="ond-detail-value">${escapeHtml(getStepSummary('transport', state))}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Time window</span>
            <span class="ond-detail-value">${escapeHtml(`${deliveryWindow.from} – ${deliveryWindow.to}`)}</span>
          </div>
        </div>

        <div class="ond-detail-card">
          <h3>Site &amp; contact</h3>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Site</span>
            <span class="ond-detail-value">${escapeHtml(site.name)}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Address</span>
            <span class="ond-detail-value">${escapeHtml(address)}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Contact</span>
            <span class="ond-detail-value">${escapeHtml(contact.name)}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Phone</span>
            <span class="ond-detail-value">${escapeHtml(contact.phone)}</span>
          </div>
          <div class="ond-detail-row">
            <span class="ond-detail-label">Email</span>
            <span class="ond-detail-value">${escapeHtml(contact.email)}</span>
          </div>
        </div>
      </div>

      <div class="ond-confirmation__equipment">
        <h3>Equipment ordered</h3>
        <ul class="ond-equipment-summary">
          ${equipmentItems}
        </ul>
      </div>

      ${paymentSummaryHtml}

      <div class="ond-confirmation__actions">
        <button type="button" class="ond-btn-primary" data-new-order>
          Create another order ${renderArrowIcon()}
        </button>
        <a class="ond-btn-secondary" href="/orders/${escapeHtml(order.number)}">
          View order
        </a>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------
   Event listeners
   ------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   Surgical patch helpers — avoid full re-render for frequent interactions
   ------------------------------------------------------------------ */

/**
 * Re-renders only the calendar container (the first div inside .ond-date-layout)
 * and re-attaches calendar event listeners. Used for month navigation and
 * day selection so the rest of the wizard never repaints.
 */
function patchCalendar(block, state) {
  const wrapper = block.querySelector('.ond-date-layout > div:first-child');
  if (!wrapper) {
    renderBlock(block, state);
    return;
  }
  const errors = getStepErrors(state, 'deliveryDate');
  wrapper.innerHTML = renderCalendar(state, errors);
  attachCalendarListeners(block, state);
}

function attachCalendarListeners(block, state) {
  block.querySelectorAll('[data-cal-nav-year]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.ui) state.ui = {};
      state.ui.calendarYear = Number(btn.dataset.calNavYear);
      state.ui.calendarMonth = Number(btn.dataset.calNavMonth);
      patchCalendar(block, state);
    });
  });

  block.querySelectorAll('[data-cal-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const parts = btn.dataset.calDate.split('-');
      if (!state.ui) state.ui = {};
      state.ui.calendarYear = Number(parts[0]);
      state.ui.calendarMonth = Number(parts[1]) - 1;
      state.data.deliveryDate = btn.dataset.calDate;
      clearStepError(state, 'deliveryDate');
      patchCalendar(block, state);
    });
  });
}

function scrollToStep(block, stepId) {
  const el = block.querySelector(`[data-step-id="${stepId}"]`);
  if (el) {
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function attachInputListeners(block, state) {
  // Navigate to a previously-completed step for editing
  block.querySelectorAll('[data-open-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.dataset.openStep;
      state.activeStep = stepId;
      renderBlock(block, state);
      scrollToStep(block, stepId);
    });
  });

  // Radio choices: order type
  block.querySelectorAll('[data-step-input="orderType"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.data.orderType = input.value;
      clearStepError(state, 'orderType');
    });
  });

  // Radio choices: transport
  block.querySelectorAll('[data-step-input="transport"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.data.transport = input.value;
      clearStepError(state, 'transport');
    });
  });

  // Plain text / email / tel fields
  block.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const { field } = input.dataset;
      state.data[field] = input.value;

      if (['contactName', 'contactPhone', 'contactEmail'].includes(field)) {
        clearStepError(state, 'siteContact');
      }
    });
  });

  // Calendar listeners (patch-only — no full re-render)
  attachCalendarListeners(block, state);

  // Time stepper: up/down arrows — surgical DOM update only
  block.querySelectorAll('[data-time-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { timeField, timePart, timeStep } = btn.dataset;
      const dir = Number(timeStep);
      const cur = state.data[timeField];
      const hasVal = cur && cur.includes(':');
      const h = hasVal ? Number(cur.split(':')[0]) : 8;
      const m = hasVal ? Number(cur.split(':')[1]) : 0;

      let newH = h;
      let newM = m;

      if (timePart === 'hour') {
        newH = ((h + dir) + 24) % 24;
      } else {
        const steps = [0, 15, 30, 45];
        const idx = steps.indexOf(m);
        const next = idx >= 0 ? (idx + dir + 4) % 4 : (dir > 0 ? 1 : 3);
        newM = steps[next];
      }

      state.data[timeField] = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
      clearStepError(state, 'deliveryWindow');

      // Surgical: update only the two display spans inside this stepper
      const stepper = btn.closest('.ond-time-stepper');
      if (stepper) {
        const displays = stepper.querySelectorAll('.ond-time-display');
        if (displays[0]) {
          displays[0].textContent = String(newH).padStart(2, '0');
          displays[0].classList.remove('is-placeholder');
        }
        if (displays[1]) {
          displays[1].textContent = String(newM).padStart(2, '0');
          displays[1].classList.remove('is-placeholder');
        }
      }
    });
  });

  // Site selection radio cards
  // Site selection radio cards — surgical DOM update
  block.querySelectorAll('[data-site-id]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const site = findSiteById(radio.dataset.siteId);
      if (!site) return;

      state.data.siteId = site.id;
      state.data.siteSearch = getSiteSearchLabel(site);
      clearStepError(state, 'siteContact');

      // Surgical: toggle is-selected on cards and swap check icon
      block.querySelectorAll('.ond-site-card').forEach((card) => {
        const cardRadio = card.querySelector('[data-site-id]');
        const isNowSelected = cardRadio?.dataset.siteId === site.id;
        card.classList.toggle('is-selected', isNowSelected);
        const check = card.querySelector('.ond-site-card__check');
        if (check) check.innerHTML = isNowSelected ? renderCheckIcon() : '';
      });
    });
  });

  // Equipment product card quantity steppers — surgical DOM update
  block.querySelectorAll('[data-qty-sku]').forEach((button) => {
    button.addEventListener('click', () => {
      const { qtySku: sku, qtyChange } = button.dataset;
      const delta = Number(qtyChange);

      state.data.equipment = state.data.equipment.filter((l) => l.sku !== '');

      const existingIndex = state.data.equipment.findIndex((l) => l.sku === sku);

      if (existingIndex >= 0) {
        const newQty = Number(state.data.equipment[existingIndex].quantity) + delta;
        if (newQty <= 0) {
          state.data.equipment.splice(existingIndex, 1);
        } else {
          state.data.equipment[existingIndex].quantity = String(newQty);
        }
      } else if (delta > 0) {
        state.data.equipment.push({ sku, quantity: '1' });
      }

      clearStepError(state, 'equipment');

      // Surgical: update only this card's qty display, minus-button state, and selected class
      const card = button.closest('.ond-equipment-card');
      if (card) {
        const newQty = Number(state.data.equipment.find((l) => l.sku === sku)?.quantity) || 0;
        const qtyEl = card.querySelector('.ond-qty-value');
        const minusBtn = card.querySelector('[data-qty-change="-1"]');
        if (qtyEl) qtyEl.value = String(newQty);
        if (minusBtn) minusBtn.disabled = newQty === 0;
        card.classList.toggle('is-selected', newQty > 0);
      }

      patchEquipmentStepLiveUi(block, state);
    });
  });

  function applyEquipmentQuantityValue(input, block, state, val) {
    const sku = input.dataset.qtySku;
    input.value = String(val);

    state.data.equipment = state.data.equipment.filter((l) => l.sku !== '');
    const existingIndex = state.data.equipment.findIndex((l) => l.sku === sku);

    if (val === 0) {
      if (existingIndex >= 0) state.data.equipment.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      state.data.equipment[existingIndex].quantity = String(val);
    } else {
      state.data.equipment.push({ sku, quantity: String(val) });
    }

    clearStepError(state, 'equipment');

    const card = input.closest('.ond-equipment-card');
    if (card) {
      const minusBtn = card.querySelector('[data-qty-change="-1"]');
      if (minusBtn) minusBtn.disabled = val === 0;
      card.classList.toggle('is-selected', val > 0);
    }

    patchEquipmentStepLiveUi(block, state);
  }

  // Equipment quantity: live subtotal on input while typing; change normalizes empty/invalid on blur
  block.querySelectorAll('input.ond-qty-value[data-qty-sku]').forEach((input) => {
    input.addEventListener('input', () => {
      const v = input.valueAsNumber;
      if (Number.isNaN(v)) {
        return;
      }
      const val = Math.max(0, Math.floor(v));
      applyEquipmentQuantityValue(input, block, state, val);
    });
    input.addEventListener('change', () => {
      let val = parseInt(input.value, 10);
      if (Number.isNaN(val) || val < 0) val = 0;
      applyEquipmentQuantityValue(input, block, state, val);
    });
  });

  // Continue to next step
  block.querySelectorAll('[data-continue-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.dataset.continueStep;

      // For equipment step, ensure no empty-sku lines remain before validation
      if (stepId === 'equipment') {
        state.data.equipment = state.data.equipment.filter((l) => l.sku !== '');
        if (state.data.equipment.length === 0) {
          state.data.equipment.push(createEquipmentLine());
        }
      }

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

      const nextStep = getNextStep(stepId);
      if (nextStep) scrollToStep(block, nextStep);
    });
  });

  // Submit order
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
        state.submitError = error.message || 'Unable to place the order. Please try again.';
      } finally {
        state.submitting = false;
        renderBlock(block, state);
      }
    });
  }
}

/* ------------------------------------------------------------------
   Shell (nav + topbar + content) — matches orders/invoices/dashboard layout
   ------------------------------------------------------------------ */
function buildTopBar(navElement) {
  const topBar = document.createElement('div');
  topBar.className = 'order-new-delivery__topbar';
  topBar.innerHTML = `
    <button class="order-new-delivery__menu-btn" aria-label="Toggle navigation" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
    <div class="order-new-delivery__topbar-copy">
      <span class="order-new-delivery__eyebrow">Customer Portal</span>
      <h1 class="order-new-delivery__page-title">Order New Delivery</h1>
    </div>
    <a class="order-new-delivery__account-link" href="${rootLink(CUSTOMER_ACCOUNT_PATH)}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="order-new-delivery__account-name">My Account</span>
    </a>
  `;

  topBar.querySelector('.order-new-delivery__menu-btn')
    .addEventListener('click', () => toggleNav(navElement));

  return topBar;
}

function renderShell(block) {
  document.body.classList.add('dashboard-page');
  block.innerHTML = '';
  block.classList.add('order-new-delivery', 'order-new-delivery-shell');

  const nav = buildNav(window.location.pathname);
  block.appendChild(nav);

  const main = document.createElement('div');
  main.className = 'order-new-delivery__main';

  const topBar = buildTopBar(nav);
  main.appendChild(topBar);

  const page = document.createElement('div');
  page.className = 'order-new-delivery__page';
  const wizardContainer = document.createElement('div');
  wizardContainer.className = 'order-new-delivery__wizard order-new-delivery-container';
  wizardContainer.dataset.siteListId = block.dataset.siteListId;
  page.appendChild(wizardContainer);
  main.appendChild(page);
  block.appendChild(main);

  return wizardContainer;
}

/* ------------------------------------------------------------------
   Main render
   ------------------------------------------------------------------ */
function renderBlock(wizardContainer, state) {
  if (!checkIsAuthenticated()) {
    wizardContainer.innerHTML = `
      <div class="ond-signin">
        <h2>Order New Delivery</h2>
        <p>You need an authenticated customer session before placing a delivery order.</p>
        <a class="button primary" href="${rootLink(CUSTOMER_LOGIN_PATH)}">Sign in to continue</a>
      </div>
    `;
    return;
  }

  const { siteListId } = wizardContainer.dataset;

  wizardContainer.innerHTML = state.submitResult
    ? renderConfirmation(state)
    : renderWizard(state, siteListId);

  if (!state.submitResult) {
    attachInputListeners(wizardContainer, state);
  } else {
    // Attach new-order button on confirmation screen
    const newOrderButton = wizardContainer.querySelector('[data-new-order]');
    if (newOrderButton) {
      newOrderButton.addEventListener('click', () => {
        const freshState = createInitialState();
        freshState.ui = {
          equipmentPrices: state.ui?.equipmentPrices,
          equipmentPricesLoaded: state.ui?.equipmentPricesLoaded,
        };
        renderBlock(wizardContainer, freshState);
      });
    }
  }
}

export default async function decorate(block) {
  block.classList.add('order-new-delivery');
  block.dataset.siteListId = `ond-sites-${Math.random().toString(36).slice(2, 10)}`;

  if (checkIsAuthenticated()) {
    try {
      await loadDeliverySitesFromAddressBook();
    } catch (err) {
      console.warn('order-new-delivery: Could not load address book for delivery sites.', err);
    }
  }

  const state = createInitialState();
  state.ui = {
    equipmentPrices: {},
    equipmentPricesLoaded: false,
  };

  const selectedSite = getSelectedSite(state);

  if (selectedSite) {
    state.data.siteSearch = getSiteSearchLabel(selectedSite);
  }

  const wizardContainer = renderShell(block);
  renderBlock(wizardContainer, state);

  if (checkIsAuthenticated()) {
    const skus = EQUIPMENT_PRODUCTS.map((p) => p.sku);
    fetchEquipmentSkuPrices(skus)
      .then((prices) => {
        state.ui.equipmentPrices = prices;
        state.ui.equipmentPricesLoaded = true;
        renderBlock(wizardContainer, state);
      })
      .catch((err) => {
        console.warn('order-new-delivery: Could not load SKU prices.', err);
        state.ui.equipmentPricesLoaded = true;
        renderBlock(wizardContainer, state);
      });
  }
}
