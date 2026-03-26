/**
 * CHEP Dashboard – Site Locations Map + Deliveries Side Panel
 *
 * MAP IMPLEMENTATION:
 * - Leaflet.js loaded from jsDelivr CDN (reliable, widely allow-listed)
 * - OpenStreetMap tiles — highly reliable, free, no API key required
 * - Nonce is read from the page's existing nonce scripts for CSP compatibility
 * - Falls back to a clean site list if Leaflet cannot load
 *
 * TILE URL: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
 *
 * DELIVERIES PANEL:
 * - Shows orders with status "processing" as active deliveries.
 * - DATA: real orders from DashboardService.fetchOrders() passed in at update time.
 */

import { MAP_CONFIG, QUICK_ACTIONS, SITE_COORDINATES } from './dashboard-config.js';
import { DELIVERY_SITES } from '../order-new-delivery/sites.js';
import {
  rootLink,
  CUSTOMER_ORDERS_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
} from '../../scripts/commerce.js';

/* ── CDN / tile constants ──────────────────────────────────────────────── */

const LEAFLET_JS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';

/** OpenStreetMap — highly reliable, no API key, widely supported (avoids CARTO tile loading issues) */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_SUBDOMAINS = 'abc';

/* ── Leaflet loader ────────────────────────────────────────────────────── */

/** Read the nonce from the first nonce-bearing script on the page. */
function getPageNonce() {
  const el = document.querySelector('script[nonce]');
  return el ? el.nonce : '';
}

function loadLeafletCss() {
  if (document.querySelector(`link[href="${LEAFLET_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function loadLeafletJs() {
  if (window.L) return Promise.resolve(window.L);

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = 'anonymous';
    const nonce = getPageNonce();
    if (nonce) script.nonce = nonce;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Leaflet failed to load from jsDelivr'));
    document.head.appendChild(script);
  });
}

/* ── Map initialiser ───────────────────────────────────────────────────── */

async function initMap(container) {
  loadLeafletCss();
  const L = await loadLeafletJs();
  const siteBounds = [];

  const map = L.map(container, {
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom,
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true,
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    subdomains: TILE_SUBDOMAINS,
    maxZoom: 20,
  }).addTo(map);

  /* Custom CHEP marker icon */
  const chepIcon = L.divIcon({
    className: 'chep-map-marker',
    html: `
      <div class="chep-map-marker__pin">
        <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 10.627 14.4 23.04 15.04 23.6a1.28 1.28 0 0 0 1.92 0C17.6 39.04 32 26.627 32 16 32 7.163 24.837 0 16 0z" fill="#005eb8"/>
          <circle cx="16" cy="16" r="6" fill="white"/>
        </svg>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -44],
  });

  /* Add a marker for each configured site */
  DELIVERY_SITES.forEach((site) => {
    const coords = SITE_COORDINATES[site.id];
    if (!coords) return;
    siteBounds.push(coords);

    const typeLabel = site.type
      ? site.type.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
      : 'Site';

    L.marker(coords, { icon: chepIcon })
      .bindPopup(
        `<div class="chep-map-popup">
          <strong class="chep-map-popup__name">${site.name}</strong>
          <div class="chep-map-popup__type">${typeLabel}</div>
          <div class="chep-map-popup__addr">${site.address1}, ${site.city}</div>
          <div class="chep-map-popup__postcode">${site.postcode}</div>
        </div>`,
        { maxWidth: 240, className: 'chep-popup-wrap' },
      )
      .addTo(map);
  });

  function fitToSites() {
    if (!siteBounds.length) return;
    map.fitBounds(siteBounds, {
      padding: [28, 28],
      maxZoom: 6,
    });
  }

  fitToSites();

  /*
   * Leaflet calculates tile coverage from the container's pixel dimensions at
   * init time. In EDS the block decorates before layout is fully painted, so
   * the container may report a small or zero size. We watch with ResizeObserver
   * and call invalidateSize() once the real dimensions are settled.
   * A 600 ms timeout acts as a belt-and-braces fallback.
   */
  let sizeFixed = false;

  function fixSize() {
    if (sizeFixed) return;
    sizeFixed = true;
    map.invalidateSize({ animate: false, pan: false });
    fitToSites();
  }

  const ro = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect && rect.width > 100 && rect.height > 100) {
      ro.disconnect();
      fixSize();
    }
  });
  ro.observe(container);

  setTimeout(fixSize, 1000);

  return map;
}

/* ── Map fallback (Leaflet unavailable) ────────────────────────────────── */

function buildMapFallback(container) {
  container.innerHTML = `
    <div class="map-fallback">
      <div class="map-fallback__icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
          <line x1="8" y1="2" x2="8" y2="18"/>
          <line x1="16" y1="6" x2="16" y2="22"/>
        </svg>
      </div>
      <p class="map-fallback__title">Map unavailable</p>
      <p class="map-fallback__desc">Map tiles could not be loaded. Your active sites are listed below.</p>
      <div class="map-fallback__sites">
        ${DELIVERY_SITES.map((s) => `
          <div class="map-fallback__site">
            <strong>${s.name}</strong>
            <span>${s.city}, ${s.postcode}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ── Deliveries side panel ─────────────────────────────────────────────── */

function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return '';
  }
}

function buildDeliveryRow(order) {
  const detailHref = rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${order.number}`);
  const li = document.createElement('li');
  li.className = 'delivery-item';

  li.innerHTML = `
    <div class="delivery-item__icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <path d="M16 8h4l3 5v3h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    </div>
    <div class="delivery-item__body">
      <a href="${detailHref}" class="delivery-item__number">#${order.number}</a>
      <span class="delivery-item__location">${order.city ?? order.location ?? 'Unknown location'}</span>
    </div>
    <div class="delivery-item__time">
      <span class="delivery-item__time-value">${formatTime(order.orderDate)}</span>
      <span class="delivery-item__date">${formatShortDate(order.orderDate)}</span>
    </div>
  `;

  return li;
}

function buildDeliverySkeletonRow() {
  const li = document.createElement('li');
  li.className = 'delivery-item delivery-item--skeleton';
  li.innerHTML = `
    <div class="delivery-item__icon">
      <div class="skeleton-block" style="width:16px;height:16px;border-radius:3px"></div>
    </div>
    <div class="delivery-item__body">
      <div class="skeleton-line" style="width:70px;height:13px;margin-bottom:4px"></div>
      <div class="skeleton-line" style="width:100px;height:11px"></div>
    </div>
    <div class="delivery-item__time">
      <div class="skeleton-line" style="width:40px;height:12px"></div>
    </div>
  `;
  return li;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Build the bottom section: Leaflet map (left) + deliveries/quick-actions (right).
 * @returns {HTMLElement}
 */
export function buildBottomSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-bottom';
  section.setAttribute('aria-label', 'Site map and recent deliveries');

  /* Left: map */
  const mapWrap = document.createElement('div');
  mapWrap.className = 'dashboard-map-wrap';

  const mapPanelHeader = document.createElement('div');
  mapPanelHeader.className = 'panel-header';
  mapPanelHeader.innerHTML = '<h2 class="panel-header__title">Site Locations</h2>';
  mapWrap.appendChild(mapPanelHeader);

  const mapContainer = document.createElement('div');
  mapContainer.className = 'dashboard-map-container';
  mapContainer.setAttribute('aria-label', 'CHEP site locations map');
  mapWrap.appendChild(mapContainer);

  section.appendChild(mapWrap);

  /* Right: deliveries + quick actions */
  const rightCol = document.createElement('div');
  rightCol.className = 'dashboard-right-col';

  /* Deliveries panel */
  const deliveriesPanel = document.createElement('div');
  deliveriesPanel.className = 'dashboard-panel dashboard-deliveries';
  deliveriesPanel.setAttribute('aria-label', 'Recent deliveries');

  const deliveriesHeader = document.createElement('div');
  deliveriesHeader.className = 'panel-header';
  deliveriesHeader.innerHTML = `
    <h2 class="panel-header__title">Recent Deliveries</h2>
    <a href="${rootLink(CUSTOMER_ORDERS_PATH)}" class="panel-header__view-all">
      View All
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </a>
  `;
  deliveriesPanel.appendChild(deliveriesHeader);

  const deliveriesCount = document.createElement('div');
  deliveriesCount.className = 'deliveries-count deliveries-count--loading';
  deliveriesCount.innerHTML = `
    <div class="skeleton-block" style="width:120px;height:28px;border-radius:6px"></div>
  `;
  deliveriesPanel.appendChild(deliveriesCount);

  const deliveriesList = document.createElement('ul');
  deliveriesList.className = 'delivery-list delivery-list--loading';
  deliveriesList.setAttribute('role', 'list');

  for (let i = 0; i < 3; i += 1) {
    deliveriesList.appendChild(buildDeliverySkeletonRow());
  }
  deliveriesPanel.appendChild(deliveriesList);

  const quickActionsPanel = buildQuickActionsPanel();

  rightCol.appendChild(deliveriesPanel);
  rightCol.appendChild(quickActionsPanel);
  section.appendChild(rightCol);

  section.__deliveriesCount = deliveriesCount;
  section.__deliveriesList = deliveriesList;
  section.__mapContainer = mapContainer;
  section.__mapInitialised = false;

  return section;
}

/**
 * Initialise the Leaflet map only after the bottom section has been appended
 * to the live DOM and the map container is visible with proper dimensions.
 * Initialising too early (e.g. when below the fold or during prerender) causes
 * zero-size container → gray tiles and markers clustered at origin.
 *
 * @param {HTMLElement} section
 */
export function initializeBottomSectionMap(section) {
  const mapContainer = section?.__mapContainer;
  if (!mapContainer || section.__mapInitialised) return;

  function doInit() {
    if (section.__mapInitialised) return;
    const { offsetWidth, offsetHeight } = mapContainer;
    if (offsetWidth < 50 || offsetHeight < 50) return;

    section.__mapInitialised = true;
    initMap(mapContainer).catch((err) => {
      console.warn('[Dashboard] Map failed to load:', err.message);
      buildMapFallback(mapContainer);
    });
  }

  /* Wait for container to be visible with dimensions (handles below-fold, prerender) */
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        io.disconnect();
        requestAnimationFrame(() => {
          requestAnimationFrame(doInit);
        });
      }
    },
    { threshold: 0.01, rootMargin: '50px' },
  );
  io.observe(mapContainer);

  /* Fallback if IntersectionObserver never fires (e.g. container always visible) */
  const id = setInterval(() => {
    if (section.__mapInitialised) {
      clearInterval(id);
      return;
    }
    const { offsetWidth, offsetHeight } = mapContainer;
    if (offsetWidth >= 50 && offsetHeight >= 50) {
      clearInterval(id);
      io.disconnect();
      doInit();
    }
  }, 100);
  setTimeout(() => {
    clearInterval(id);
    if (!section.__mapInitialised) doInit();
  }, 3000);
}

/**
 * Update the deliveries panel with real order data.
 * @param {HTMLElement} section
 * @param {object|null} ordersData
 * @param {boolean} isAuthenticated
 */
export function updateDeliveriesPanel(section, ordersData, isAuthenticated) {
  const countEl = section.__deliveriesCount;
  const listEl = section.__deliveriesList;

  if (!countEl || !listEl) return;

  countEl.classList.remove('deliveries-count--loading');
  listEl.classList.remove('delivery-list--loading');

  if (!isAuthenticated || !ordersData) {
    countEl.innerHTML = '';
    listEl.innerHTML = '<li class="delivery-empty"><p>Sign in to view delivery activity.</p></li>';
    return;
  }

  const delivering = (ordersData.orders ?? []).filter((o) => o.status === 'processing');

  countEl.innerHTML = `
    <div class="deliveries-count__badge">
      <span class="deliveries-count__number">${delivering.length}</span>
      <span class="deliveries-count__label">Delivering</span>
      <span class="status-pill status-pill--info" style="margin-left:8px">Moving</span>
    </div>
  `;

  listEl.innerHTML = '';

  if (!delivering.length) {
    listEl.innerHTML = '<li class="delivery-empty"><p>No active deliveries at this time.</p></li>';
    return;
  }

  delivering.slice(0, 4).forEach((order) => {
    listEl.appendChild(buildDeliveryRow(order));
  });
}

/* ── Quick actions panel ───────────────────────────────────────────────── */

function buildQuickActionsPanel() {
  const panel = document.createElement('div');
  panel.className = 'dashboard-panel dashboard-quick-actions';
  panel.setAttribute('aria-label', 'Quick actions');

  panel.innerHTML = `
    <div class="panel-header">
      <h2 class="panel-header__title">Quick Actions</h2>
    </div>
    <ul class="quick-actions-list" role="list">
      ${QUICK_ACTIONS.map((action) => `
        <li class="quick-action-item">
          <a href="${action.href}" class="quick-action-link${action.primary ? ' quick-action-link--primary' : ''}">
            <span class="quick-action-link__label">${action.label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </a>
        </li>
      `).join('')}
    </ul>
  `;

  return panel;
}
