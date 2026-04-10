/**
 * Bodea Address Book — dashboard shell + custom delivery locations UI + map
 */

import { Addresses } from '@dropins/storefront-account/containers/Addresses.js';
import { render as accountRenderer } from '@dropins/storefront-account/render.js';

import { readBlockConfig } from '../../scripts/aem.js';
import {
  CUSTOMER_ADDRESS_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { getConfigValue } from '../../scripts/utils.js';
import {
  buildSiteMapFallback,
  focusAddressBookMapOnSite,
  initSiteLocationsMap,
  refreshDashboardSiteMarkers,
  setAddressBookMapSelection,
} from '../bodea-dashboard/dashboard-map.js';
import {
  getDeliverySites,
  getPrimaryDeliverySite,
  loadDeliverySitesFromAddressBook,
  sortDeliverySitesForAccountUI,
} from '../order-new-delivery/sites.js';

import { removeAddressBySiteId, setDefaultShippingBySiteId } from './address-book-actions.js';
import {
  buildIconButton,
  buildTagRow,
  buildTextAction,
  getStreetLines,
} from './address-book-ui.js';

import '../../scripts/initializers/auth.js';
import '../../scripts/initializers/account.js';

const TAG_LABELS = { shipping: 'Shipping', billing: 'Billing' };

function normalizeMapHeight(value) {
  const s = String(value || '').toLowerCase().trim();
  return s === 'short' ? 'short' : 'tall';
}

function readMapHeight(block, section, cfg) {
  const fromModel = cfg?.mapheight ?? cfg?.['map-height'];
  const raw = getConfigValue(
    block.dataset.bodeaaddrMapheight,
    section?.dataset || {},
    ['bodeaaddrMapheight', 'dataBodeaaddrMapheight'],
    fromModel ?? 'tall',
  );
  return normalizeMapHeight(raw);
}

function scheduleMapInit(mapContainer, runInit) {
  let started = false;

  function tryStart() {
    if (started) return;
    const { offsetWidth, offsetHeight } = mapContainer;
    if (offsetWidth < 50 || offsetHeight < 50) return;
    started = true;
    runInit();
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        io.disconnect();
        requestAnimationFrame(() => {
          requestAnimationFrame(tryStart);
        });
      }
    },
    { threshold: 0.01, rootMargin: '80px' },
  );
  io.observe(mapContainer);

  const poll = setInterval(() => {
    if (started) {
      clearInterval(poll);
      return;
    }
    tryStart();
    if (started) clearInterval(poll);
  }, 100);

  setTimeout(() => {
    clearInterval(poll);
    tryStart();
  }, 3000);
}

function createSearchGlyphSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '11');
  c.setAttribute('cy', '11');
  c.setAttribute('r', '7');
  c.setAttribute('stroke', 'currentColor');
  c.setAttribute('stroke-width', '1.75');
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  l.setAttribute('stroke', 'currentColor');
  l.setAttribute('stroke-width', '1.75');
  l.setAttribute('stroke-linecap', 'round');
  l.setAttribute('d', 'M16.5 16.5 21 21');
  svg.appendChild(c);
  svg.appendChild(l);
  return svg;
}

/**
 * @param {object} site
 * @param {HTMLElement} into
 */
function fillAddressBlock(site, into) {
  const lines = getStreetLines(site);
  lines.forEach((line) => {
    const p = document.createElement('p');
    p.className = 'bodea-loc-card__line';
    p.textContent = line;
    into.appendChild(p);
  });
  const cityLine = [site.city, site.region].filter(Boolean).join(', ');
  const meta = document.createElement('p');
  meta.className = 'bodea-loc-card__meta';
  meta.textContent = [cityLine, site.postcode].filter(Boolean).join(' · ');
  into.appendChild(meta);
  if (site.telephone) {
    const tel = document.createElement('p');
    tel.className = 'bodea-loc-card__phone';
    tel.textContent = site.telephone;
    into.appendChild(tel);
  }
}

export default async function decorate(block) {
  const section = block.closest('.section');
  const cfg = readBlockConfig(block);
  const mapHeightMode = readMapHeight(block, section, cfg);
  block.dataset.bodeaaddrMapheight = mapHeightMode;
  block.dataset.loading = 'true';

  if (!checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
    return;
  }

  let buildTopBar;
  let updateAccountName;
  let buildNav;
  let DashboardService;
  try {
    const [dashMod, navMod, svcMod] = await Promise.all([
      import('../bodea-dashboard/bodea-dashboard.js'),
      import('../bodea-dashboard/dashboard-nav.js'),
      import('../bodea-dashboard/dashboard-service.js'),
    ]);
    ({ buildTopBar, updateAccountName } = dashMod);
    ({ buildNav } = navMod);
    ({ DashboardService } = svcMod);
  } catch (err) {
    console.error('bodea-address-book: Failed to load dashboard shell modules.', err);
    block.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'bodea-address-book__error';
    p.textContent = 'Could not load this page. Please refresh or try again later.';
    block.appendChild(p);
    delete block.dataset.loading;
    return;
  }

  document.body.classList.add('dashboard-page', 'bodea-address-book-page');

  block.textContent = '';
  block.classList.add('bodea-dashboard');

  const { pathname } = window.location;
  const nav = buildNav(pathname);
  const mainEl = document.createElement('div');
  mainEl.className = 'bodea-dashboard-main';
  const topBar = buildTopBar(nav);
  const contentWrap = document.createElement('div');
  contentWrap.className = 'bodea-dashboard-content';

  const root = document.createElement('div');
  root.className = 'bodea-address-book';

  const page = document.createElement('div');
  page.className = 'bodea-address-book__page';

  const shell = document.createElement('div');
  shell.className = 'bodea-address-book__shell';

  /* ── Page header ───────────────────────────────────────────────── */
  const pageHead = document.createElement('div');
  pageHead.className = 'bodea-address-book__page-head';

  const pageHeadText = document.createElement('div');
  pageHeadText.className = 'bodea-address-book__page-head-text';

  const h1 = document.createElement('h1');
  h1.className = 'bodea-address-book__page-title';
  h1.textContent = 'Delivery Locations';

  const subtitle = document.createElement('p');
  subtitle.className = 'bodea-address-book__page-subtitle';
  subtitle.textContent = 'Manage your saved delivery and billing addresses';

  pageHeadText.appendChild(h1);
  pageHeadText.appendChild(subtitle);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'bodea-address-book__btn bodea-address-book__btn--primary bodea-address-book__btn--add';
  addBtn.textContent = '+ Add New Location';
  addBtn.setAttribute('aria-label', 'Add new location');

  pageHead.appendChild(pageHeadText);
  pageHead.appendChild(addBtn);

  const heroRule = document.createElement('hr');
  heroRule.className = 'bodea-address-book__hero-rule';

  const defaultSection = document.createElement('section');
  defaultSection.className = 'bodea-address-book__default-section';
  defaultSection.setAttribute('aria-label', 'Default delivery address');
  defaultSection.hidden = true;

  const layout = document.createElement('div');
  layout.className = 'bodea-address-book__layout';

  const listCol = document.createElement('div');
  listCol.className = 'bodea-address-book__col bodea-address-book__col--list';

  const toolbar = document.createElement('div');
  toolbar.className = 'bodea-address-book__toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'bodea-address-book__search';

  const searchLabel = document.createElement('label');
  searchLabel.className = 'bodea-address-book__vh';
  searchLabel.htmlFor = 'bodeaaddr-search';
  searchLabel.textContent = 'Search locations';

  const searchInner = document.createElement('div');
  searchInner.className = 'bodea-address-book__search-inner';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'bodea-address-book__search-glyph';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.appendChild(createSearchGlyphSvg());

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'bodeaaddr-search';
  searchInput.className = 'bodea-address-book__search-input';
  searchInput.placeholder = 'Search locations';
  searchInput.setAttribute('autocomplete', 'off');

  const filterShip = document.createElement('select');
  filterShip.className = 'bodea-address-book__filter-select';
  filterShip.setAttribute('aria-label', 'Filter by shipping default');
  [['all', 'All shipping'], ['yes', 'Default shipping'], ['no', 'Non-default']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    filterShip.appendChild(o);
  });

  const filterBill = document.createElement('select');
  filterBill.className = 'bodea-address-book__filter-select';
  filterBill.setAttribute('aria-label', 'Filter by billing default');
  [['all', 'All billing'], ['yes', 'Default billing'], ['no', 'Non-default']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    filterBill.appendChild(o);
  });

  searchInner.appendChild(searchIcon);
  searchInner.appendChild(searchInput);
  searchWrap.appendChild(searchLabel);
  searchWrap.appendChild(searchInner);

  toolbar.appendChild(searchWrap);
  toolbar.appendChild(filterShip);
  toolbar.appendChild(filterBill);

  const locationsList = document.createElement('div');
  locationsList.className = 'bodea-address-book__locations-list';
  locationsList.setAttribute('role', 'list');

  const emptyState = document.createElement('div');
  emptyState.className = 'bodea-address-book__empty';
  emptyState.hidden = true;
  const emptyP = document.createElement('p');
  emptyP.className = 'bodea-address-book__empty-text';
  emptyP.textContent = 'No saved locations yet. Add your first delivery address to see it here.';
  emptyState.appendChild(emptyP);

  const dropinHost = document.createElement('div');
  dropinHost.className = 'bodea-address-book__dropin-host';

  /* Commerce Addresses drop-in lives in a modal <dialog> (visible, interactive). */
  const addressDialog = document.createElement('dialog');
  addressDialog.className = 'bodea-address-book__address-dialog';
  addressDialog.setAttribute('aria-labelledby', 'bodeaaddr-address-dialog-title');

  const addressDialogBackdrop = document.createElement('button');
  addressDialogBackdrop.type = 'button';
  addressDialogBackdrop.className = 'bodea-address-book__address-dialog__backdrop';
  addressDialogBackdrop.setAttribute('aria-label', 'Close dialog');

  const addressDialogPanel = document.createElement('div');
  addressDialogPanel.className = 'bodea-address-book__address-dialog__panel';

  const addressDialogHeader = document.createElement('div');
  addressDialogHeader.className = 'bodea-address-book__address-dialog__header';

  const addressDialogTitle = document.createElement('h2');
  addressDialogTitle.id = 'bodeaaddr-address-dialog-title';
  addressDialogTitle.className = 'bodea-address-book__address-dialog__title';
  addressDialogTitle.textContent = 'Add new location';

  const addressDialogClose = document.createElement('button');
  addressDialogClose.type = 'button';
  addressDialogClose.className = 'bodea-address-book__address-dialog__close';
  addressDialogClose.setAttribute('aria-label', 'Close');
  addressDialogClose.textContent = '×';

  const addressDialogBody = document.createElement('div');
  addressDialogBody.className = 'bodea-address-book__address-dialog__body';
  addressDialogBody.appendChild(dropinHost);

  addressDialogHeader.appendChild(addressDialogTitle);
  addressDialogHeader.appendChild(addressDialogClose);
  addressDialogPanel.appendChild(addressDialogHeader);
  addressDialogPanel.appendChild(addressDialogBody);
  addressDialog.appendChild(addressDialogBackdrop);
  addressDialog.appendChild(addressDialogPanel);

  listCol.appendChild(toolbar);
  listCol.appendChild(locationsList);
  listCol.appendChild(emptyState);

  const mapCard = document.createElement('section');
  mapCard.className = 'bodea-address-book__map-panel';
  mapCard.setAttribute('aria-label', 'Location map');

  const mapHeader = document.createElement('div');
  mapHeader.className = 'bodea-address-book__panel-header';

  const mapHeadText = document.createElement('div');
  mapHeadText.className = 'bodea-address-book__panel-head-text';

  const mapTitle = document.createElement('h2');
  mapTitle.className = 'bodea-address-book__panel-title';
  mapTitle.textContent = 'Location map';

  const mapSub = document.createElement('p');
  mapSub.className = 'bodea-address-book__panel-sub';
  mapSub.textContent = 'View and explore your saved locations on the map.';

  mapHeadText.appendChild(mapTitle);
  mapHeadText.appendChild(mapSub);

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.className = 'bodea-address-book__btn bodea-address-book__btn--secondary';
  syncBtn.textContent = 'Refresh map';
  syncBtn.setAttribute('aria-label', 'Refresh map from address book');

  mapHeader.appendChild(mapHeadText);
  mapHeader.appendChild(syncBtn);

  const mapContainer = document.createElement('div');
  mapContainer.className = 'bodea-address-book__map-container dashboard-map-container';
  mapContainer.setAttribute('aria-label', 'Map of saved delivery addresses');

  mapCard.appendChild(mapHeader);
  mapCard.appendChild(mapContainer);

  layout.appendChild(listCol);
  layout.appendChild(mapCard);

  shell.appendChild(pageHead);
  shell.appendChild(heroRule);
  shell.appendChild(defaultSection);
  shell.appendChild(layout);
  root.appendChild(shell);
  page.appendChild(root);
  contentWrap.appendChild(page);

  document.body.appendChild(addressDialog);

  mainEl.appendChild(topBar);
  mainEl.appendChild(contentWrap);
  block.appendChild(nav);
  block.appendChild(mainEl);

  let selectedSiteId = null;

  function sortedSitesForUi() {
    return sortDeliverySitesForAccountUI(getDeliverySites());
  }

  function siteIndexInSorted(siteId) {
    const sorted = sortedSitesForUi();
    return sorted.findIndex((s) => s.id === siteId);
  }

  function triggerDropinEdit(siteId) {
    const idx = siteIndexInSorted(siteId);
    if (idx < 0) return;
    const cards = dropinHost.querySelectorAll('.account-address-card');
    const card = cards[idx];
    const editBtn = card?.querySelector('[data-testid="editButton"]');
    if (editBtn) editBtn.click();
    else console.warn('bodea-address-book: Edit control not found for index', idx);
  }

  function triggerDropinAdd() {
    const addEl = dropinHost.querySelector('.account-actions-address');
    if (addEl) addEl.click();
    else console.warn('bodea-address-book: Add control not found');
  }

  function closeAddressDialog() {
    if (addressDialog.open) addressDialog.close();
  }

  /**
   * @param {'add'|'edit'} mode
   * @param {string} [siteId] for edit
   */
  function openAddressDialog(mode, siteId) {
    addressDialog.dataset.bodeaaddrMode = mode;
    addressDialogTitle.textContent = mode === 'edit' ? 'Edit address' : 'Add new location';
    if (!addressDialog.open) addressDialog.showModal();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (mode === 'edit' && siteId) triggerDropinEdit(siteId);
        else if (mode === 'add') triggerDropinAdd();
      });
    });
  }

  function applyListFilters() {
    const q = searchInput.value.trim().toLowerCase();
    const fs = filterShip.value;
    const fb = filterBill.value;
    const cards = locationsList.querySelectorAll('.bodea-loc-card');
    cards.forEach((card) => {
      const id = card.dataset.siteId;
      const site = getDeliverySites().find((s) => s.id === id);
      if (!site) return;
      const text = `${site.name} ${site.city} ${site.postcode} ${site.region}`.toLowerCase();
      let show = !q || text.includes(q);
      if (show && fs === 'yes') show = !!site.defaultShipping;
      if (show && fs === 'no') show = !site.defaultShipping;
      if (show && fb === 'yes') show = show && !!site.defaultBilling;
      if (show && fb === 'no') show = show && !site.defaultBilling;
      card.hidden = !show;
      card.style.display = show ? '' : 'none';
    });
  }

  searchInput.addEventListener('input', applyListFilters);
  filterShip.addEventListener('change', applyListFilters);
  filterBill.addEventListener('change', applyListFilters);

  addBtn.disabled = true;

  addBtn.addEventListener('click', () => {
    openAddressDialog('add');
  });

  addressDialogClose.addEventListener('click', () => {
    closeAddressDialog();
  });

  addressDialogBackdrop.addEventListener('click', () => {
    closeAddressDialog();
  });

  function setCardSelection(siteId) {
    selectedSiteId = siteId;
    locationsList.querySelectorAll('.bodea-loc-card').forEach((el) => {
      const on = el.dataset.siteId === siteId;
      el.classList.toggle('bodea-loc-card--selected', on);
      el.setAttribute('aria-current', on ? 'true' : 'false');
    });
    setAddressBookMapSelection(mapContainer, siteId || null);
  }

  function buildDefaultCard(site) {
    defaultSection.textContent = '';
    defaultSection.hidden = false;

    const card = document.createElement('div');
    card.className = 'bodea-address-book__default-card';

    const label = document.createElement('p');
    label.className = 'bodea-address-book__default-label';
    label.textContent = 'Default Delivery Address';

    const name = document.createElement('p');
    name.className = 'bodea-address-book__default-name';
    name.textContent = site.name;

    const body = document.createElement('div');
    body.className = 'bodea-address-book__default-body';
    fillAddressBlock(site, body);

    card.appendChild(label);
    card.appendChild(name);
    card.appendChild(body);
    card.appendChild(buildTagRow(site, TAG_LABELS));

    const actions = document.createElement('div');
    actions.className = 'bodea-address-book__default-actions';

    const editLink = document.createElement('button');
    editLink.type = 'button';
    editLink.className = 'bodea-loc-card__link-action';
    editLink.textContent = 'Edit';
    editLink.addEventListener('click', () => openAddressDialog('edit', site.id));

    const changeLink = document.createElement('a');
    changeLink.className = 'bodea-loc-card__link-action bodea-loc-card__link-action--anchor';
    changeLink.href = rootLink(CUSTOMER_ADDRESS_PATH);
    changeLink.textContent = 'Change default';
    changeLink.setAttribute('rel', 'noopener noreferrer');

    actions.appendChild(editLink);
    actions.appendChild(document.createTextNode(' '));
    actions.appendChild(changeLink);

    card.appendChild(actions);
    defaultSection.appendChild(card);
  }

  function buildLocationCard(site) {
    const card = document.createElement('article');
    card.className = 'bodea-loc-card';
    card.dataset.siteId = site.id;
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;

    const head = document.createElement('div');
    head.className = 'bodea-loc-card__head';

    const title = document.createElement('h3');
    title.className = 'bodea-loc-card__title';
    title.textContent = site.name;

    const actions = document.createElement('div');
    actions.className = 'bodea-loc-card__icon-actions';
    actions.appendChild(
      buildIconButton('map', 'View on map', () => {
        setCardSelection(site.id);
        focusAddressBookMapOnSite(mapContainer, site.id);
      }),
    );
    actions.appendChild(
      buildIconButton('edit', 'Edit address', () => openAddressDialog('edit', site.id)),
    );
    actions.appendChild(
      buildIconButton('delete', 'Delete address', async () => {
        /* eslint-disable-next-line no-alert -- minimal confirm until inline dialog exists */
        if (!window.confirm('Remove this address from your address book?')) return;
        try {
          await removeAddressBySiteId(site.id);
          await syncMapFromBook();
          renderLocationsUi();
        } catch (e) {
          console.warn('bodea-address-book: Remove failed', e);
          /* eslint-disable-next-line no-alert -- user-visible failure */
          window.alert('Could not remove this address. Please try again.');
        }
      }),
    );

    head.appendChild(title);
    head.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'bodea-loc-card__body';
    fillAddressBlock(site, body);

    const tags = buildTagRow(site, TAG_LABELS);

    const foot = document.createElement('div');
    foot.className = 'bodea-loc-card__foot';
    if (!site.defaultShipping) {
      foot.appendChild(
        buildTextAction('Set as default', async () => {
          try {
            await setDefaultShippingBySiteId(site.id);
            await syncMapFromBook();
            renderLocationsUi();
          } catch (e) {
            console.warn('bodea-address-book: Set default failed', e);
            /* eslint-disable-next-line no-alert -- user-visible failure */
            window.alert('Could not update default address.');
          }
        }),
      );
    }
    foot.appendChild(
      buildTextAction('View on map', () => {
        setCardSelection(site.id);
        focusAddressBookMapOnSite(mapContainer, site.id);
      }),
    );

    card.appendChild(head);
    card.appendChild(body);
    if (tags.childNodes.length) card.appendChild(tags);
    card.appendChild(foot);

    function activate() {
      setCardSelection(site.id);
      focusAddressBookMapOnSite(mapContainer, site.id);
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('button,a')) return;
      activate();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });

    return card;
  }

  function renderLocationsUi() {
    const sites = getDeliverySites();
    locationsList.textContent = '';

    if (!sites.length) {
      defaultSection.hidden = true;
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    const primary = getPrimaryDeliverySite(sites);
    if (primary) {
      buildDefaultCard(primary);
    } else {
      defaultSection.hidden = true;
    }

    const sorted = sortedSitesForUi();
    const listSites = primary
      ? sorted.filter((s) => s.id !== primary.id)
      : sorted;
    listSites.forEach((site) => {
      locationsList.appendChild(buildLocationCard(site));
    });

    applyListFilters();
    if (selectedSiteId && !sites.some((s) => s.id === selectedSiteId)) {
      selectedSiteId = null;
      setAddressBookMapSelection(mapContainer, null);
    }
  }

  try {
    const customerIdentity = await DashboardService.fetchCustomerIdentity();
    updateAccountName(topBar, customerIdentity);
  } catch (err) {
    console.warn('bodea-address-book: Could not load customer for top bar.', err);
    updateAccountName(topBar, null);
  }

  async function syncMapFromBook() {
    await loadDeliverySitesFromAddressBook({ retryIfEmpty: true });
    await refreshDashboardSiteMarkers(mapContainer);
  }

  try {
    await loadDeliverySitesFromAddressBook({ retryIfEmpty: true });
  } catch (err) {
    console.warn('bodea-address-book: Could not load address book.', err);
  }

  renderLocationsUi();

  let mapStarted = false;
  async function startMap() {
    if (mapStarted) return;
    mapStarted = true;
    try {
      await initSiteLocationsMap(mapContainer);
    } catch (err) {
      console.warn('bodea-address-book: Map failed to load:', err?.message || err);
      buildSiteMapFallback(mapContainer);
    }
  }

  scheduleMapInit(mapContainer, () => {
    startMap();
  });

  syncBtn.addEventListener('click', () => {
    syncMapFromBook()
      .then(() => renderLocationsUi())
      .catch((err) => {
        console.warn('bodea-address-book: Refresh map failed.', err);
      });
  });

  await accountRenderer.render(Addresses, {
    minifiedView: false,
    withActionsInMinifiedView: false,
    withActionsInFullSizeView: true,
    withHeader: false,
    routeAddressesPage: () => rootLink(CUSTOMER_ADDRESS_PATH),
    onSuccess: () => {
      syncMapFromBook()
        .then(() => {
          renderLocationsUi();
          closeAddressDialog();
        })
        .catch((err) => {
          console.warn('bodea-address-book: Map sync after save failed.', err);
        });
    },
  })(dropinHost);

  addBtn.disabled = false;

  delete block.dataset.loading;
}
