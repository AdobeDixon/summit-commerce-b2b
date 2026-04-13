/**
 * Bodea Dashboard – Spend trend panel (rolling weeks, configurable period)
 */

import { rootLink, CUSTOMER_LOGIN_PATH } from '../../scripts/commerce.js';
import {
  DEFAULT_SPEND_TREND_WEEKS,
  SPEND_TREND_PERIOD_OPTIONS,
} from './dashboard-config.js';
import {
  buildSpendTrendFromOrders,
  collectSpendTrendDebugSnapshot,
  sliceSpendTrendToPeriodWeeks,
} from './dashboard-service.js';

/**
 * Empty band above the tallest bar (fraction of plot height). With sqrt bar heights,
 * scaleMax = maxWeek / (1 - v)² so the peak bar stops at height (1 − v) of the plot.
 */
const SPEND_CHART_VISUAL_HEADROOM = 0.12;

/** Bar heights use pixels (must stay within `.spend-trend__plot` height in CSS). */
function getSpendChartPlotPx() {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
    return 140;
  }
  return 172;
}

function getPeriodWeeks(section) {
  const raw = section.dataset.periodWeeks;
  const n = Number(raw);
  if (Number.isFinite(n) && SPEND_TREND_PERIOD_OPTIONS.includes(n)) {
    return n;
  }
  return DEFAULT_SPEND_TREND_WEEKS;
}

/**
 * Prefer REST spend trend when the service returned a full series (covers history).
 * Otherwise derive from orders — needs paginated orders for older weeks (DashboardService).
 * Period filter: slice REST points to last N weeks, or rebuild from orders for N weeks.
 */
function resolveSpendTrendData(section, spendTrendData, ordersData) {
  const pw = getPeriodWeeks(section);
  const pts = spendTrendData?.points ?? [];
  const restUsable = pts.length > 0 && !spendTrendData?.error;
  if (restUsable) {
    return sliceSpendTrendToPeriodWeeks(spendTrendData, pw);
  }
  if (ordersData?.orders?.length) {
    return buildSpendTrendFromOrders(ordersData, pw);
  }
  return spendTrendData;
}

function buildPanelHeader(section) {
  if (!section.dataset.spendInstanceId) {
    section.dataset.spendInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  const sid = section.dataset.spendInstanceId;
  const selectId = `spend-trend-period-${sid}`;

  const header = document.createElement('div');
  header.className = 'panel-header panel-header--spend-trend';

  const titles = document.createElement('div');
  titles.className = 'panel-header__spend-titles';

  const title = document.createElement('h2');
  title.className = 'panel-header__title';
  title.textContent = 'Spend trend';

  titles.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'spend-trend__header-actions';

  const filterLabel = document.createElement('label');
  filterLabel.className = 'spend-trend__filter-label';
  filterLabel.setAttribute('for', selectId);
  filterLabel.textContent = 'Period';

  const select = document.createElement('select');
  select.id = selectId;
  select.className = 'spend-trend__period';
  select.setAttribute('aria-label', 'Time period for spend trend');

  SPEND_TREND_PERIOD_OPTIONS.forEach((w) => {
    const opt = document.createElement('option');
    opt.value = String(w);
    opt.textContent = `${w} weeks`;
    select.appendChild(opt);
  });

  select.value = String(getPeriodWeeks(section));
  if (!section.dataset.periodWeeks) {
    section.dataset.periodWeeks = String(DEFAULT_SPEND_TREND_WEEKS);
  }

  actions.appendChild(filterLabel);
  actions.appendChild(select);

  const subtitle = document.createElement('span');
  subtitle.className = 'panel-header__meta';
  subtitle.textContent = 'Weekly breakdown';

  header.appendChild(titles);
  header.appendChild(actions);
  header.appendChild(subtitle);

  if (!section.dataset.periodFilterBound) {
    section.dataset.periodFilterBound = 'true';
    select.addEventListener('change', () => {
      section.dataset.periodWeeks = select.value;
      updateSpendTrendSection(
        section,
        section.__spendTrendPayload,
        section.__isAuthenticated,
        section.__ordersData,
      );
    });
  }

  return header;
}

function buildSkeleton(periodWeeks = DEFAULT_SPEND_TREND_WEEKS) {
  const root = document.createElement('div');
  root.className = 'spend-trend spend-trend--loading';

  const metrics = document.createElement('div');
  metrics.className = 'spend-trend__metrics';
  metrics.innerHTML = `
    <div class="spend-trend__metric spend-trend__metric--primary">
      <span class="spend-trend__metric-label">Rolling spend</span>
      <span class="spend-trend__metric-value skeleton-line" style="height:36px;width:140px;border-radius:6px"></span>
    </div>
    <div class="spend-trend__metric">
      <span class="spend-trend__metric-label">Avg order value</span>
      <span class="spend-trend__metric-value spend-trend__metric-value--secondary skeleton-line" style="height:28px;width:100px;border-radius:6px"></span>
    </div>
  `;

  const chart = document.createElement('div');
  chart.className = 'spend-trend__chart';
  const chartBody = document.createElement('div');
  chartBody.className = 'spend-trend__chart-body';
  chartBody.style.setProperty('--spend-plot-px', '172px');
  const ySkel = document.createElement('div');
  ySkel.className = 'spend-trend__y-axis spend-trend__y-axis--skeleton';
  ySkel.setAttribute('aria-hidden', 'true');
  const plotShell = document.createElement('div');
  plotShell.className = 'spend-trend__plot-shell';
  const bars = document.createElement('div');
  bars.className = 'spend-trend__bars';
  const cols = Math.max(periodWeeks, 4);
  for (let i = 0; i < cols; i += 1) {
    const col = document.createElement('div');
    col.className = 'spend-trend__col';
    const plot = document.createElement('div');
    plot.className = 'spend-trend__plot';
    const bar = document.createElement('div');
    bar.className = 'spend-trend__bar spend-trend__bar--skeleton';
    plot.appendChild(bar);
    const tick = document.createElement('span');
    tick.className = 'spend-trend__tick spend-trend__tick--week';
    tick.appendChild(document.createElement('span'));
    tick.firstChild.className = 'skeleton-line';
    tick.firstChild.style.width = '60%';
    col.appendChild(plot);
    col.appendChild(tick);
    bars.appendChild(col);
  }
  plotShell.appendChild(bars);
  chartBody.appendChild(ySkel);
  chartBody.appendChild(plotShell);
  chart.appendChild(chartBody);
  root.appendChild(metrics);
  root.appendChild(chart);
  return root;
}

function buildEmptyState(message, ctaLabel, ctaHref) {
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  const icon = document.createElement('div');
  icon.className = 'panel-empty__icon';
  icon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
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

function formatCurrency(amount, currency) {
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

/** Compact currency for Y-axis (e.g. £92K). */
function formatAxisSpend(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCurrency(amount, currency);
  }
}

function pickNiceStep(rough) {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  let base = 10;
  if (n <= 1) base = 1;
  else if (n <= 2) base = 2;
  else if (n <= 5) base = 5;
  return base * pow;
}

function niceSpendStepsFromMax(maxVal, maxSteps = 6) {
  if (maxVal <= 0) return [0];
  const step = pickNiceStep(maxVal / Math.max(2, maxSteps - 2));
  const out = new Set([0, maxVal]);
  for (let v = step; v < maxVal; v += step) {
    out.add(Math.min(v, maxVal));
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * Drop or merge ticks that sit too close on the sqrt vertical scale (overlapping labels).
 * When two collide, keep the larger $ value (usually the scale ceiling).
 * @param {{ value: number, bottomPct: number, label: string }[]} ticks
 * @param {number} minGapPct — minimum distance between tick positions (0–100)
 * @returns {{ value: number, bottomPct: number, label: string }[]}
 */
function pruneSpendAxisTicksByGap(ticks, minGapPct) {
  if (ticks.length <= 1) return ticks;
  const sorted = [...ticks].sort((a, b) => a.bottomPct - b.bottomPct);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const t = sorted[i];
    const prev = out[out.length - 1];
    const gap = t.bottomPct - prev.bottomPct;
    if (gap >= minGapPct) {
      out.push(t);
    } else if (t.value > prev.value) {
      out[out.length - 1] = t;
    }
  }
  return out;
}

/**
 * Linear $ ceiling for sqrt mapping so the tallest bar fills (1 − headroom) of plot height.
 * @param {number} maxWeekAmount
 * @returns {number}
 */
function spendChartScaleMax(maxWeekAmount) {
  if (!Number.isFinite(maxWeekAmount) || maxWeekAmount <= 0) return 0;
  const v = SPEND_CHART_VISUAL_HEADROOM;
  const denom = (1 - v) * (1 - v);
  return maxWeekAmount / denom;
}

/**
 * Y-axis ticks aligned to sqrt bar scale (labels are linear $; position matches bar height).
 * @param {number} scaleMax — linear $ ceiling (includes headroom above max week)
 * @param {string} currency
 * @returns {{ value: number, bottomPct: number, label: string }[]}
 */
function buildSpendAxisTicks(scaleMax, currency) {
  const maxSqrt = scaleMax > 0 ? Math.sqrt(scaleMax) : 1;
  const values = scaleMax <= 0 ? [0] : niceSpendStepsFromMax(scaleMax, 5);
  const raw = values.map((value) => ({
    value,
    bottomPct: value <= 0 ? 0 : (Math.sqrt(value) / maxSqrt) * 100,
    label: formatAxisSpend(value, currency),
  }));
  /* Sqrt compresses high values: neighbouring $ steps can overlap without pruning. */
  return pruneSpendAxisTicksByGap(raw, 9);
}

/**
 * Short week-start label for the X-axis (day + month).
 * @param {{ weekKey?: string, label?: string }} pt
 * @returns {string}
 */
function formatWeekStartAxisLabel(pt) {
  if (!pt.weekKey || typeof pt.weekKey !== 'string' || pt.weekKey.length < 10) {
    return pt.label ?? '—';
  }
  const d = new Date(`${pt.weekKey.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return pt.label ?? '—';
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Mon–Sun label for the ISO week starting at `weekKey` (YYYY-MM-DD).
 * @param {{ weekKey?: string, label?: string }} pt
 * @returns {string}
 */
function formatWeekRangeLabel(pt) {
  if (!pt.weekKey || typeof pt.weekKey !== 'string' || pt.weekKey.length < 10) {
    return pt.label ?? 'Week';
  }
  const start = new Date(`${pt.weekKey.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) {
    return pt.label ?? 'Week';
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  const a = start.toLocaleDateString('en-GB', opts);
  const b = end.toLocaleDateString('en-GB', opts);
  return `${a} – ${b}`;
}

function barToneFromIndex(idx, count) {
  if (count <= 1) return 11;
  return Math.round((idx / (count - 1)) * 11);
}

/**
 * Place tooltip above the pointer using fixed positioning (avoids “stuck at top of chart”).
 * @param {HTMLElement} tipEl
 * @param {number} clientX
 * @param {number} clientY
 */
function positionSpendTooltipAtPointer(tipEl, clientX, clientY) {
  tipEl.style.position = 'fixed';
  tipEl.style.left = `${clientX}px`;
  tipEl.style.top = `${clientY}px`;
  tipEl.style.transform = 'translate(-50%, calc(-100% - 10px))';
  requestAnimationFrame(() => {
    const rect = tipEl.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    let dy = 0;
    if (rect.left < pad) dx = pad - rect.left;
    if (rect.right > window.innerWidth - pad) dx = window.innerWidth - pad - rect.right;
    if (rect.top < pad) dy = pad - rect.top;
    if (rect.bottom > window.innerHeight - pad) dy = window.innerHeight - pad - rect.bottom;
    if (dx !== 0 || dy !== 0) {
      tipEl.style.left = `${clientX + dx}px`;
      tipEl.style.top = `${clientY + dy}px`;
    }
  });
}

/**
 * @param {HTMLElement} tipEl
 * @param {HTMLElement} plot
 * @param {HTMLElement} bar
 * @param {boolean} isEmptyBar
 */
function positionSpendTooltipForKeyboardFocus(tipEl, plot, bar, isEmptyBar) {
  let x;
  let y;
  if (isEmptyBar) {
    const pr = plot.getBoundingClientRect();
    x = pr.left + pr.width / 2;
    y = pr.bottom - 10;
  } else {
    const br = bar.getBoundingClientRect();
    x = br.left + br.width / 2;
    y = br.top + br.height / 2;
  }
  tipEl.style.position = 'fixed';
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
  tipEl.style.transform = 'translate(-50%, calc(-100% - 10px))';
}

function buildMetricsRow(spendTrendData, currency) {
  const row = document.createElement('div');
  row.className = 'spend-trend__metrics';

  const pw = spendTrendData?.periodWeeks
    ?? spendTrendData?.points?.length
    ?? DEFAULT_SPEND_TREND_WEEKS;
  const total = spendTrendData?.totalSpendPeriod ?? spendTrendData?.totalSpend12w ?? 0;
  const avgOrder = spendTrendData?.avgOrderValue;
  const avgWeek = spendTrendData?.avgWeeklySpend ?? 0;

  const primary = document.createElement('div');
  primary.className = 'spend-trend__metric spend-trend__metric--primary';
  const pl = document.createElement('span');
  pl.className = 'spend-trend__metric-label';
  pl.textContent = `Rolling ${pw}-week spend`;
  const pv = document.createElement('span');
  pv.className = 'spend-trend__metric-value';
  pv.textContent = formatCurrency(total, currency);

  const secondary = document.createElement('div');
  secondary.className = 'spend-trend__metric';
  const sl = document.createElement('span');
  sl.className = 'spend-trend__metric-label';
  const sv = document.createElement('span');
  sv.className = 'spend-trend__metric-value spend-trend__metric-value--secondary';
  if (avgOrder != null && !Number.isNaN(avgOrder)) {
    sl.textContent = 'Avg order value';
    sv.textContent = formatCurrency(avgOrder, currency);
  } else {
    sl.textContent = 'Avg weekly spend';
    sv.textContent = formatCurrency(avgWeek, currency);
  }

  primary.appendChild(pl);
  primary.appendChild(pv);
  secondary.appendChild(sl);
  secondary.appendChild(sv);
  row.appendChild(primary);
  row.appendChild(secondary);
  return row;
}

/**
 * @param {HTMLElement} section
 * @param {object} spendTrendData
 * @param {boolean} isAuthenticated
 * @param {object|null} [ordersData]
 */
export function updateSpendTrendSection(
  section,
  spendTrendData,
  isAuthenticated,
  ordersData = null,
) {
  delete section.dataset.loading;
  const meta = section.querySelector('.panel-header__meta');
  const select = section.querySelector('.spend-trend__period');

  section.__spendTrendPayload = spendTrendData;
  section.__ordersData = ordersData;
  section.__isAuthenticated = isAuthenticated;

  if (select) {
    select.disabled = !ordersData?.orders?.length;
    select.title = select.disabled
      ? 'Period options need order history'
      : 'Change how many weeks to include';
    select.value = String(getPeriodWeeks(section));
  }

  try {
    section.querySelectorAll('.spend-trend, .panel-empty').forEach((el) => el.remove());

    if (!isAuthenticated) {
      if (meta) meta.textContent = 'Weekly breakdown';
      section.appendChild(
        buildEmptyState(
          'Sign in to see your spending trend.',
          'Sign In',
          rootLink(CUSTOMER_LOGIN_PATH),
        ),
      );
      return;
    }

    const ptsIn = spendTrendData?.points ?? [];
    const restOk = ptsIn.length > 0 && !spendTrendData?.error;
    let pathUsed = 'empty';
    if (restOk) {
      pathUsed = 'rest-sliced';
    } else if (ordersData?.orders?.length) {
      pathUsed = 'graphql-orders';
    }
    const resolved = resolveSpendTrendData(section, spendTrendData, ordersData);

    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('dashboardDebugSpend') === '1') {
        console.info(
          '[bodea-dashboard][SpendTrendDebug]',
          collectSpendTrendDebugSnapshot({
            ordersData,
            spendTrendData,
            resolved,
            pathUsed,
          }),
        );
      }
    } catch {
      /* ignore */
    }

    const err = resolved?.error;
    if (err && err !== null) {
      if (meta) meta.textContent = 'Weekly breakdown';
      section.appendChild(
        buildEmptyState(
          'Spend trend could not be loaded. Try again later or contact support if this persists.',
          null,
          null,
        ),
      );
      return;
    }

    const rawPoints = resolved?.points ?? [];
    const points = rawPoints.filter((p) => typeof p?.amount === 'number' && !Number.isNaN(p.amount));
    const pw = resolved?.periodWeeks ?? getPeriodWeeks(section);

    if (!points.length) {
      if (meta) meta.textContent = 'Weekly breakdown';
      section.appendChild(
        buildEmptyState(
          `No spend data for the last ${pw} weeks yet.`,
          'Create order',
          rootLink('/order'),
        ),
      );
      return;
    }

    if (meta) {
      meta.textContent = resolved?.source === 'graphql' ? 'From your orders' : 'Weekly breakdown';
    }

    const currency = resolved?.currency ?? points[0]?.currency ?? 'GBP';
    const amounts = points.map((p) => p.amount).filter((a) => !Number.isNaN(a));
    const positiveAmounts = amounts.filter((a) => a > 0);
    const maxPositive = positiveAmounts.length ? Math.max(...positiveAmounts) : 0;
    const scaleMax = spendChartScaleMax(maxPositive);
    /* Sqrt mapping vs scaleMax (includes headroom so bars do not max out the plot). */
    const maxSqrt = scaleMax > 0 ? Math.sqrt(scaleMax) : 1;
    const plotPx = getSpendChartPlotPx();
    const nBars = points.length;

    const wrap = document.createElement('div');
    wrap.className = 'spend-trend';

    wrap.appendChild(buildMetricsRow(resolved, currency));

    const chart = document.createElement('div');
    chart.className = 'spend-trend__chart';

    const chartBody = document.createElement('div');
    chartBody.className = 'spend-trend__chart-body';
    chartBody.style.setProperty('--spend-plot-px', `${plotPx}px`);

    const yAxis = document.createElement('div');
    yAxis.className = 'spend-trend__y-axis';
    yAxis.setAttribute('aria-hidden', 'true');

    const axisTicks = buildSpendAxisTicks(scaleMax, currency);
    axisTicks.forEach((t) => {
      const lab = document.createElement('span');
      lab.className = 'spend-trend__y-label';
      lab.textContent = t.label;
      lab.style.bottom = `${t.bottomPct}%`;
      yAxis.appendChild(lab);
    });

    const plotShell = document.createElement('div');
    plotShell.className = 'spend-trend__plot-shell';

    const gridEl = document.createElement('div');
    gridEl.className = 'spend-trend__grid';
    gridEl.setAttribute('aria-hidden', 'true');
    axisTicks.forEach((t) => {
      const line = document.createElement('div');
      line.className = 'spend-trend__grid-line';
      line.style.bottom = `${t.bottomPct}%`;
      gridEl.appendChild(line);
    });

    const bars = document.createElement('div');
    bars.className = 'spend-trend__bars';
    bars.setAttribute('role', 'group');
    bars.setAttribute('aria-label', 'Weekly spend');

    points.forEach((pt, idx) => {
      const col = document.createElement('div');
      col.className = 'spend-trend__col';
      col.tabIndex = 0;
      const cur = pt.currency ?? currency;
      const periodText = formatWeekRangeLabel(pt);
      const amountText = formatCurrency(pt.amount, cur);
      col.setAttribute('aria-label', `${periodText}, ${amountText}`);

      const plot = document.createElement('div');
      plot.className = 'spend-trend__plot';

      const tipEl = document.createElement('div');
      tipEl.className = 'spend-trend__tooltip';
      tipEl.setAttribute('aria-hidden', 'true');
      const tipPeriod = document.createElement('span');
      tipPeriod.className = 'spend-trend__tooltip-period';
      tipPeriod.textContent = periodText;
      const tipAmount = document.createElement('span');
      tipAmount.className = 'spend-trend__tooltip-amount';
      tipAmount.textContent = amountText;
      tipEl.appendChild(tipPeriod);
      tipEl.appendChild(tipAmount);

      const bar = document.createElement('div');
      bar.className = 'spend-trend__bar';
      bar.setAttribute('aria-hidden', 'true');
      bar.dataset.tone = String(barToneFromIndex(idx, nBars));
      const amt = Number(pt.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        bar.classList.add('spend-trend__bar--empty');
        bar.style.height = '0';
      } else {
        const ratio = Math.sqrt(amt) / maxSqrt;
        const hPx = Math.max(3, Math.round(ratio * plotPx));
        bar.style.height = `${hPx}px`;
      }
      bar.style.flexShrink = '0';

      plot.appendChild(tipEl);
      plot.appendChild(bar);
      col.appendChild(plot);

      const isEmptyBar = !Number.isFinite(amt) || amt <= 0;
      const showTip = () => {
        tipEl.classList.add('spend-trend__tooltip--visible');
      };
      const hideTip = () => {
        tipEl.classList.remove('spend-trend__tooltip--visible');
      };

      const onPlotPointer = (e) => {
        showTip();
        positionSpendTooltipAtPointer(tipEl, e.clientX, e.clientY);
      };

      plot.addEventListener('pointerenter', onPlotPointer);
      plot.addEventListener('pointermove', onPlotPointer);
      plot.addEventListener('pointerleave', hideTip);

      col.addEventListener('focus', () => {
        showTip();
        positionSpendTooltipForKeyboardFocus(tipEl, plot, bar, isEmptyBar);
      });
      col.addEventListener('blur', hideTip);

      const tick = document.createElement('span');
      tick.className = 'spend-trend__tick spend-trend__tick--week';
      tick.textContent = formatWeekStartAxisLabel(pt);

      col.appendChild(tick);
      bars.appendChild(col);
    });

    plotShell.appendChild(gridEl);
    plotShell.appendChild(bars);
    chartBody.appendChild(yAxis);
    chartBody.appendChild(plotShell);
    chart.appendChild(chartBody);

    const sumLabel = points.reduce((s, p) => s + p.amount, 0);
    wrap.setAttribute('role', 'img');
    wrap.setAttribute(
      'aria-label',
      `Spend by week, ${pw} weeks, total ${formatCurrency(sumLabel, currency)}. `
        + 'Vertical scale matches bar height; horizontal labels are week-start dates.',
    );

    wrap.appendChild(chart);
    section.appendChild(wrap);
  } catch (e) {
    console.warn('bodea-dashboard: Spend trend render failed:', e);
    if (meta) meta.textContent = 'Weekly breakdown';
    section.appendChild(
      buildEmptyState(
        'Spend trend could not be displayed. Please refresh the page.',
        null,
        null,
      ),
    );
  }
}

/**
 * @returns {HTMLElement}
 */
export function buildSpendTrendSection() {
  const section = document.createElement('section');
  section.className = 'dashboard-panel dashboard-spend-trend';
  section.setAttribute('aria-label', 'Spend trend');
  section.dataset.loading = 'true';
  section.dataset.periodWeeks = String(DEFAULT_SPEND_TREND_WEEKS);

  section.appendChild(buildPanelHeader(section));
  section.appendChild(buildSkeleton(Number(section.dataset.periodWeeks)));

  return section;
}
