# Bodea Address Book

## Overview

Full-width experience that combines:

- **Dashboard chrome** — Same left navigation rail and top bar as **Bodea Dashboard** (`buildNav`, `buildTopBar`); sets `body.dashboard-page` and loads `bodea-dashboard.css` so the standard site header/footer are hidden like on `/dashboard`.
- **Interactive map** — Same Leaflet + OpenStreetMap implementation as the Bodea dashboard (`dashboard-map.js`): terracotta pins, geocoding for saved Commerce addresses, UK postcode lookup via postcodes.io where applicable, and a list fallback if the map cannot load.
- **Address management** — Adobe Commerce Storefront `Addresses` drop-in for add, edit, remove, and default shipping/billing behaviour.

Authors place this block on the customer address page (for example `/customer/address`) instead of or alongside the plain `commerce-addresses` block. **Do not mount two full `Addresses` containers on the same page** — use this block alone for the combined map + forms experience.

## DA.live integration and authoring structure

1. Open the address page document in Document Authoring.
2. Add a **Bodea Address Book** block (single empty cell is enough).
3. Optionally set **Headline** and **Map height** in the block model.
4. Place **section metadata** immediately above the block when you need layout overrides (see below).

### Row / cell shape

- Key-value block: optional rows map to `readBlockConfig` keys (`headline`, `mapheight`).

## Configuration options

| Source | Purpose |
|--------|---------|
| Block model (DA) | Optional headline; map height preset (`tall` / `short`). |
| Section metadata | Override map height with `bodeaaddr-mapheight`. |
| Commerce | Requires authenticated customer; redirects guests to login. |

## Metadata precedence

This block uses a single layout control (map height). Tier order:

1. **Layout tier** — `bodeaaddr-mapheight` (section metadata), then block `data-bodeaaddr-mapheight` / model `mapheight`, then default `tall`.
2. **Content tier** — Optional `headline` from block authoring only (section does not override in code).

**Override rules**

| Condition | Winner | Effect |
|-----------|--------|--------|
| Section sets `bodeaaddr-mapheight` | Section | Map column uses short or tall height preset. |
| No section key | Block model `mapheight` | Same presets. |
| Neither | Default `tall` | Taller map viewport. |

**Conflict / no-op notes**

- Invalid values (not `short` or `tall`) normalize to `tall`; the block does not throw.

## Behavior patterns

- The block root uses class `bodea-dashboard` and adds **`dashboard-page`** to `<body>` so layout matches the dashboard (full viewport, no default header/footer).
- Top bar account name is filled via `DashboardService.fetchCustomerIdentity()` when possible.
- On load, the block loads customer addresses into the shared delivery-site pipeline (`loadDeliverySitesFromAddressBook`), then initialises the map when the map container has measurable size (IntersectionObserver + resize safety, same as dashboard).
- After a successful address save from the drop-in (`onSuccess`), addresses reload and map markers refresh.
- **Refresh map** triggers a manual reload + marker refresh (useful if another tab changed data).
- Unauthenticated users are redirected to the customer login URL with `rootLink`.
- Loading state: `data-loading` is set on the block until the drop-in has mounted.

## Accessibility notes

- Map container has an `aria-label`; hero region is labelled.
- **Refresh map** is a native `button` with visible focus styles.
- Pin popups reuse dashboard markup; map fallback lists sites when tiles fail.
- Respect `prefers-reduced-motion` for UI transitions (buttons, marker hover).

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Empty map, addresses exist | Network / geocoding delay; use **Refresh map**. Ensure B2B company header is consistent (`sites.js` sync). |
| Redirect to login | Session expired; sign in again. |
| Gray map tiles | Container had zero size at init — resize the window or use **Refresh map**; block uses ResizeObserver + delayed `invalidateSize` via shared dashboard code. |
| Markers outdated after edit | Save from the in-page form (fires sync); or **Refresh map**. |

## DA.live Model Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Headline | text | *(empty)* | Replaces default title “Address book”. |
| Map height | select | `tall` | `tall` or `short` map viewport. |

## Section Metadata Reference

| key / field | possible values | effect |
|-------------|-----------------|--------|
| `bodeaaddr-mapheight` | `short`, `tall` | **Default: tall.** Controls minimum height of the map panel. `short` uses a shorter viewport for dense pages. |

Place metadata on the section immediately above the block. Keys are read from `section.dataset` in camelCase (`bodeaaddrMapheight`) and double-prefix form (`dataBodeaaddrMapheight`) per project conventions.

## Technical notes

- **Map**: `initSiteLocationsMap`, `refreshDashboardSiteMarkers`, and `buildSiteMapFallback` are exported from `blocks/bodea-dashboard/dashboard-map.js`.
- **Data**: `loadDeliverySitesFromAddressBook` / `getDeliverySites` from `blocks/order-new-delivery/sites.js`.
- **Account UI**: `@dropins/storefront-account` `Addresses` via `scripts/initializers/account.js`.
