#!/usr/bin/env node
/* eslint-disable import/extensions, no-console, no-await-in-loop, no-restricted-syntax */
/**
 * Patch Admin REST order header (and line) monetary fields by scaling toward a target grand total.
 * Use on sandbox/demo only — changing totals on invoiced orders can be rejected or break reporting.
 *
 * Usage:
 *   node scripts/patch-order-grand-totals.mjs
 *   DRY_RUN=1 node scripts/patch-order-grand-totals.mjs
 *   TARGET_GRAND_TOTAL=2500 node scripts/patch-order-grand-totals.mjs
 *
 * Env:
 *   TARGET_GRAND_TOTAL — optional. If set, every order uses this same grand total.
 *     If unset, each order gets a random target in [GRAND_TOTAL_MIN, GRAND_TOTAL_MAX].
 *   GRAND_TOTAL_MIN — default 2000 (used when TARGET_GRAND_TOTAL is unset).
 *   GRAND_TOTAL_MAX — default 5000 (used when TARGET_GRAND_TOTAL is unset).
 *   ORDERS_JSON — path to batch JSON with { orders: [{ orderNumber }] }.
 *     Default: .demo-order-runs/joe-batch-30-historic.json
 *   ORDER_INCREMENT_IDS — optional comma list (overrides JSON), e.g. 000000049,000000050
 *   DRY_RUN=1 — log only, no POST
 *   INCLUDE_ORDER_48=1 — also patch 000000048 if listed in batch file (not in batch by default)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCommerceAdminRestContext } from './lib/accs-admin-rest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

for (const p of [path.join(repoRoot, '.env'), path.join(repoRoot, 'cypress', 'src', 'support', '.env')]) {
  try {
    const content = fs.readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
    break;
  } catch {
    /* noop */
  }
}

function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

const MONEY_ORDER_KEYS = new Set([
  'adjustment_negative',
  'adjustment_positive',
  'base_adjustment_negative',
  'base_adjustment_positive',
  'base_currency_code',
  'base_discount_amount',
  'base_discount_canceled',
  'base_discount_invoiced',
  'base_discount_tax_compensation_amount',
  'base_grand_total',
  'base_shipping_amount',
  'base_shipping_canceled',
  'base_shipping_discount_amount',
  'base_shipping_discount_tax_compensation_amnt',
  'base_shipping_incl_tax',
  'base_shipping_invoiced',
  'base_shipping_refunded',
  'base_shipping_tax_amount',
  'base_subtotal',
  'base_subtotal_canceled',
  'base_subtotal_incl_tax',
  'base_subtotal_invoiced',
  'base_tax_amount',
  'base_tax_canceled',
  'base_tax_invoiced',
  'base_tax_refunded',
  'base_total_canceled',
  'base_total_due',
  'base_total_invoiced',
  'base_total_invoiced_cost',
  'base_total_offline_refunded',
  'base_total_online_refunded',
  'base_total_paid',
  'base_to_global_rate',
  'base_to_order_rate',
  'discount_amount',
  'discount_canceled',
  'discount_invoiced',
  'discount_tax_compensation_amount',
  'grand_total',
  'shipping_amount',
  'shipping_canceled',
  'shipping_discount_amount',
  'shipping_discount_tax_compensation_amount',
  'shipping_incl_tax',
  'shipping_invoiced',
  'shipping_refunded',
  'shipping_tax_amount',
  'store_to_base_rate',
  'store_to_order_rate',
  'subtotal',
  'subtotal_canceled',
  'subtotal_incl_tax',
  'subtotal_invoiced',
  'tax_amount',
  'tax_canceled',
  'tax_invoiced',
  'tax_refunded',
  'total_canceled',
  'total_due',
  'total_invoiced',
  'total_offline_refunded',
  'total_online_refunded',
  'total_paid',
]);

const MONEY_ITEM_KEYS = new Set([
  'amount_refunded',
  'base_amount_refunded',
  'base_discount_amount',
  'base_discount_invoiced',
  'base_discount_tax_compensation_amount',
  'base_original_price',
  'base_price',
  'base_price_incl_tax',
  'base_row_invoiced',
  'base_row_total',
  'base_row_total_incl_tax',
  'base_tax_amount',
  'base_tax_invoiced',
  'base_tax_refunded',
  'discount_amount',
  'discount_invoiced',
  'discount_tax_compensation_amount',
  'original_price',
  'price',
  'price_incl_tax',
  'row_invoiced',
  'row_total',
  'row_total_incl_tax',
  'tax_amount',
  'tax_invoiced',
  'tax_refunded',
]);

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/** Uniform random grand total in [min, max], two decimal places. */
function randomGrandInRange(min, max) {
  const u = Math.random() * (max - min) + min;
  return roundMoney(u);
}

function scaleMoneyObject(obj, keys, ratio) {
  const out = { ...obj };
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(out, k)) {
      const v = out[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = roundMoney(v * ratio);
      }
    }
  }
  return out;
}

function buildEntityWithScaledTotals(fullOrder, targetGrand) {
  const current = Number(fullOrder.grand_total);
  const base = Number.isFinite(current) && current !== 0
    ? current
    : Number(fullOrder.base_grand_total);
  const denom = Number.isFinite(base) && base !== 0 ? base : 1;
  const ratio = targetGrand / denom;

  const entity = scaleMoneyObject(fullOrder, MONEY_ORDER_KEYS, ratio);

  if (Array.isArray(fullOrder.items) && fullOrder.items.length) {
    entity.items = fullOrder.items.map((it) => scaleMoneyObject(it, MONEY_ITEM_KEYS, ratio));
  }

  entity.grand_total = roundMoney(targetGrand);
  entity.base_grand_total = roundMoney(targetGrand);

  return entity;
}

async function resolveIncrementIds() {
  const explicit = getEnv('ORDER_INCREMENT_IDS');
  if (explicit) {
    return explicit.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const jsonPath = path.join(
    repoRoot,
    getEnv('ORDERS_JSON') || '.demo-order-runs/joe-batch-30-historic.json',
  );
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const nums = (data.orders ?? []).map((o) => o.orderNumber).filter(Boolean);
  if (getEnv('INCLUDE_ORDER_48') === '1' && !nums.includes('000000048')) {
    nums.unshift('000000048');
  }
  return nums;
}

async function main() {
  const fixedRaw = getEnv('TARGET_GRAND_TOTAL');
  const fixedTarget = fixedRaw !== undefined && fixedRaw !== '' ? Number(fixedRaw) : NaN;
  const useFixed = Number.isFinite(fixedTarget) && fixedTarget > 0;

  const minRaw = getEnv('GRAND_TOTAL_MIN');
  const maxRaw = getEnv('GRAND_TOTAL_MAX');
  const rangeMin = minRaw !== undefined && minRaw !== '' ? Number(minRaw) : 2000;
  const rangeMax = maxRaw !== undefined && maxRaw !== '' ? Number(maxRaw) : 5000;

  if (!useFixed) {
    const rangeInvalid = !Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)
      || rangeMin <= 0 || rangeMax <= rangeMin;
    if (rangeInvalid) {
      throw new Error(
        'Set GRAND_TOTAL_MIN / GRAND_TOTAL_MAX to positive numbers with min < max (defaults 2000 / 5000), '
        + 'or set TARGET_GRAND_TOTAL for a single fixed amount.',
      );
    }
  } else if (!Number.isFinite(fixedTarget) || fixedTarget <= 0) {
    throw new Error('TARGET_GRAND_TOTAL must be a positive number when set.');
  }

  const dryRun = getEnv('DRY_RUN') === '1' || getEnv('DRY_RUN') === 'true';
  const incrementIds = await resolveIncrementIds();
  if (!incrementIds.length) {
    throw new Error('No order increment ids — set ORDER_INCREMENT_IDS or ORDERS_JSON with orders[].orderNumber.');
  }

  const { v1Base, headers } = await getCommerceAdminRestContext();

  if (useFixed) {
    console.log(`Target grand_total per order: fixed ${fixedTarget}`);
  } else {
    console.log(`Target grand_total per order: random in [${rangeMin}, ${rangeMax}]`);
  }
  console.log(`Orders: ${incrementIds.length}`, incrementIds.join(', '));
  console.log(`Dry run: ${dryRun}`);

  const results = [];

  for (const incrementId of incrementIds) {
    const searchUrl = `${v1Base}/orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(incrementId)}`;
    const sRes = await fetch(searchUrl, { headers });
    const sData = await sRes.json();
    const row = sData?.items?.[0];
    if (!sRes.ok || !row?.entity_id) {
      console.warn('Skip / not found:', incrementId, sRes.status);
      results.push({ incrementId, ok: false, error: 'not_found' });
    } else {
      const entityId = row.entity_id;
      const getRes = await fetch(`${v1Base}/orders/${entityId}`, { headers });
      const getText = await getRes.text();
      if (!getRes.ok) {
        console.warn('GET order failed', incrementId, getRes.status, getText.slice(0, 200));
        results.push({ incrementId, ok: false, error: 'get_failed' });
      } else {
        const fullOrder = JSON.parse(getText);
        const before = fullOrder.grand_total;
        const targetGrand = useFixed ? fixedTarget : randomGrandInRange(rangeMin, rangeMax);
        const entity = buildEntityWithScaledTotals(fullOrder, targetGrand);

        const payload = { entity };
        if (dryRun) {
          console.log(
            `[dry-run] ${incrementId} entity_id=${entityId} grand_total ${before} -> ${entity.grand_total} `
            + `(target ${targetGrand})`,
          );
          results.push({
            incrementId,
            ok: true,
            dryRun: true,
            targetGrand,
          });
        } else {
          const postRes = await fetch(`${v1Base}/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
          const postText = await postRes.text();
          console.log(`POST ${incrementId}`, postRes.status, postText.slice(0, 280));
          results.push({
            incrementId,
            ok: postRes.ok,
            status: postRes.status,
            snippet: postText.slice(0, 400),
            targetGrand,
          });
        }
      }
    }
  }

  console.log(JSON.stringify({ results }, null, 2));
}

await main();
