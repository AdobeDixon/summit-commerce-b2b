/**
 * Bodea Dashboard – Company credit panel (limit, used, available, utilisation bar)
 */

import { rootLink, CUSTOMER_LOGIN_PATH } from '../../scripts/commerce.js';

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)}`;
  }
}

/** Next calendar quarter first day, e.g. "1 Jul" */
function nextQuarterResetLabel() {
  const now = new Date();
  const m = now.getMonth();
  const qStart = [0, 3, 6, 9];
  let nextMonth = qStart.find((qm) => qm > m);
  const d = new Date(now);
  if (nextMonth === undefined) {
    d.setFullYear(d.getFullYear() + 1);
    nextMonth = 0;
  }
  d.setMonth(nextMonth, 1);
  d.setHours(12, 0, 0, 0);
  return `Resets ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function buildPanelHeader() {
  const header = document.createElement('div');
  header.className = 'panel-header panel-header--company-credit';

  const titles = document.createElement('div');
  titles.className = 'panel-header__spend-titles';

  const title = document.createElement('h2');
  title.className = 'panel-header__title';
  title.textContent = 'Company credit';

  const subtitle = document.createElement('span');
  subtitle.className = 'panel-header__meta';
  subtitle.textContent = 'Account terms';

  titles.appendChild(title);

  const view = document.createElement('a');
  view.className = 'panel-header__view-all';
  view.href = rootLink('/customer/company/credit');
  view.textContent = 'View details';

  header.appendChild(titles);
  header.appendChild(subtitle);
  header.appendChild(view);

  return header;
}

function buildSkeleton() {
  const root = document.createElement('div');
  root.className = 'company-credit company-credit--loading';

  const top = document.createElement('div');
  top.className = 'company-credit__top-cards';
  for (let i = 0; i < 3; i += 1) {
    const card = document.createElement('div');
    card.className = 'company-credit__mini-card';
    card.innerHTML = `
      <span class="company-credit__mini-label skeleton-line" style="height:12px;width:60%;border-radius:4px"></span>
      <span class="company-credit__mini-value skeleton-line" style="height:32px;width:85%;border-radius:6px;margin-top:8px"></span>
      <span class="company-credit__mini-sub skeleton-line" style="height:14px;width:55%;border-radius:4px;margin-top:8px"></span>
    `;
    top.appendChild(card);
  }

  const wide = document.createElement('div');
  wide.className = 'company-credit__util-card';
  wide.innerHTML = `
    <div class="company-credit__util-head">
      <span class="skeleton-line" style="height:16px;width:40%;border-radius:4px"></span>
      <span class="skeleton-line" style="height:24px;width:72px;border-radius:999px"></span>
    </div>
    <div class="company-credit__bar-track">
      <div class="company-credit__bar-fill skeleton-line" style="width:45%;height:100%;border-radius:999px"></div>
    </div>
    <div class="company-credit__bar-scale">
      <span class="skeleton-line" style="height:12px;width:28px;border-radius:4px"></span>
      <span class="skeleton-line" style="height:12px;width:48px;border-radius:4px"></span>
    </div>
  `;

  root.appendChild(top);
  root.appendChild(wide);
  return root;
}

function buildEmptyState(message, ctaLabel, ctaHref) {
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  const icon = document.createElement('div');
  icon.className = 'panel-empty__icon';
  icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
  </svg>`;
  const p = document.createElement('p');
  p.className = 'panel-empty__message';
  p.textContent = message;
  empty.appendChild(icon);
  empty.appendChild(p);
  if (ctaHref) {
    const a = document.createElement('a');
    a.className = 'panel-empty__cta';
    a.href = ctaHref;
    a.textContent = ctaLabel;
    empty.appendChild(a);
  }
  return empty;
}

/** Payment on Account is off in Commerce Admin (store-wide; not per company). */
function buildPoaDisabledState() {
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  const icon = document.createElement('div');
  icon.className = 'panel-empty__icon';
  icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
  </svg>`;
  const p = document.createElement('p');
  p.className = 'panel-empty__message';
  const poaMsg = 'Payment on Account is disabled for this store in Adobe Commerce. A store administrator must enable it under Stores → Configuration → Sales → Payment Methods → Payment on Account. That setting is store-wide (it is not scoped to a single company name such as Terrablock). After it is enabled, refresh this page.';
  p.textContent = poaMsg;
  const doc = document.createElement('a');
  doc.className = 'panel-empty__cta';
  const poaDocUrl = 'https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/payments/payment-on-account';
  doc.href = poaDocUrl;
  doc.target = '_blank';
  doc.rel = 'noopener noreferrer';
  doc.textContent = 'Adobe Commerce: configure Payment on Account';
  empty.appendChild(icon);
  empty.appendChild(p);
  empty.appendChild(doc);
  return empty;
}

/**
 * @param {object} payload
 * @param {boolean} isAuthenticated
 */
export function updateCompanyCreditSection(section, payload, isAuthenticated) {
  delete section.dataset.loading;
  section.__companyCreditPayload = payload;

  section.querySelectorAll('.company-credit, .panel-empty').forEach((el) => el.remove());

  if (!isAuthenticated) {
    section.appendChild(
      buildEmptyState(
        'Sign in to see your company credit.',
        'Sign In',
        rootLink(CUSTOMER_LOGIN_PATH),
      ),
    );
    return;
  }

  const err = payload?.error;
  if (err === 'not_b2b' || err === 'no_company' || err === 'no_credit') {
    section.appendChild(
      buildEmptyState(
        'Company credit is available for business accounts with credit enabled.',
        null,
        null,
      ),
    );
    return;
  }

  if (err === 'poa_disabled') {
    section.appendChild(buildPoaDisabledState());
    return;
  }

  if (err && err !== null) {
    section.appendChild(
      buildEmptyState(
        'Company credit could not be loaded. Try again later or open Company Credit from your account menu.',
        'Company credit',
        rootLink('/customer/company/credit'),
      ),
    );
    return;
  }

  const limit = Number(payload?.creditLimit);
  let available = Number(payload?.availableCredit);
  const rawOutstanding = Number(payload?.outstandingBalance);

  if (!Number.isFinite(limit) || limit < 0) {
    section.appendChild(
      buildEmptyState(
        'No company credit data is available for your account yet.',
        null,
        null,
      ),
    );
    return;
  }

  /*
   * Commerce may return outstanding_balance = 0 while available_credit is still below the limit
   * (different definitions: invoiced vs open authorizations, etc.). For this summary we align
   * Used + utilisation with Limit and Available: used = limit − available (clamped).
   */
  if (!Number.isFinite(available)) {
    if (Number.isFinite(rawOutstanding) && rawOutstanding >= 0) {
      available = Math.max(0, limit - rawOutstanding);
    } else {
      section.appendChild(buildEmptyState('Could not read credit balances.', null, null));
      return;
    }
  }

  available = Math.min(Math.max(0, available), limit);
  const used = Math.max(0, limit - available);
  const currency = payload?.currency || 'GBP';
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const root = document.createElement('div');
  root.className = 'company-credit';

  const top = document.createElement('div');
  top.className = 'company-credit__top-cards';

  const cardLimit = document.createElement('div');
  cardLimit.className = 'company-credit__mini-card';
  cardLimit.innerHTML = `
    <span class="company-credit__mini-label">Credit limit</span>
    <span class="company-credit__mini-value">${formatMoney(limit, currency)}</span>
    <span class="company-credit__mini-sub">Quarterly</span>
  `;

  const cardUsed = document.createElement('div');
  cardUsed.className = 'company-credit__mini-card';
  cardUsed.innerHTML = `
    <span class="company-credit__mini-label">Used</span>
    <span class="company-credit__mini-value company-credit__mini-value--used">${formatMoney(used, currency)}</span>
    <span class="company-credit__mini-sub">${pct}% utilised</span>
  `;

  const cardAvail = document.createElement('div');
  cardAvail.className = 'company-credit__mini-card';
  cardAvail.innerHTML = `
    <span class="company-credit__mini-label">Available</span>
    <span class="company-credit__mini-value company-credit__mini-value--avail">${formatMoney(available, currency)}</span>
    <span class="company-credit__mini-sub">${nextQuarterResetLabel()}</span>
  `;

  top.appendChild(cardLimit);
  top.appendChild(cardUsed);
  top.appendChild(cardAvail);

  const util = document.createElement('div');
  util.className = 'company-credit__util-card';

  const head = document.createElement('div');
  head.className = 'company-credit__util-head';
  const h3 = document.createElement('span');
  h3.className = 'company-credit__util-title';
  h3.textContent = 'Credit utilisation';
  const badge = document.createElement('span');
  badge.className = 'company-credit__util-badge';
  badge.textContent = `${pct}% used`;

  head.appendChild(h3);
  head.appendChild(badge);

  const track = document.createElement('div');
  track.className = 'company-credit__bar-track';
  const fill = document.createElement('div');
  fill.className = 'company-credit__bar-fill';
  fill.style.width = `${pct}%`;
  fill.setAttribute('role', 'presentation');
  track.appendChild(fill);

  const scale = document.createElement('div');
  scale.className = 'company-credit__bar-scale';
  const s0 = document.createElement('span');
  s0.textContent = formatMoney(0, currency);
  const s1 = document.createElement('span');
  s1.textContent = formatMoney(limit, currency);
  scale.appendChild(s0);
  scale.appendChild(s1);

  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(pct));
  track.setAttribute(
    'aria-valuetext',
    `${pct}% used (${formatMoney(used, currency)} of ${formatMoney(limit, currency)} limit)`,
  );
  track.setAttribute('aria-label', 'Credit utilisation');

  util.appendChild(head);
  util.appendChild(track);
  util.appendChild(scale);

  root.appendChild(top);
  root.appendChild(util);
  section.appendChild(root);
}

export function buildCompanyCreditSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-panel dashboard-company-credit';
  section.setAttribute('aria-label', 'Company credit');
  section.dataset.loading = 'true';

  section.appendChild(buildPanelHeader());
  section.appendChild(buildSkeleton());

  return section;
}
