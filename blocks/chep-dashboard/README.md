# CHEP Dashboard Block

## Overview

The CHEP Dashboard block provides the MyCHEP homepage experience: left navigation, KPI cards, recent orders, stock alerts, equipment overview, and a map with delivery activity. It loads Commerce data asynchronously and replaces the standard header/footer with a full-page dashboard layout.

## DA.live Integration

- **Type**: key-value-block
- **Rows/Columns**: Single empty cell
- Block takes over viewport; add to document at `/dashboard` or `/`

## Configuration

No section metadata. Configuration (SKUs, thresholds, nav) lives in `dashboard-config.js`.

## Architecture

- `dashboard-config.js` — SKUs, thresholds, nav items
- `dashboard-service.js` — GraphQL (orders, stock)
- `dashboard-nav.js` — Left nav rail
- `dashboard-kpi.js` — KPI cards
- `dashboard-orders.js` — Orders table
- `dashboard-stock.js` — Low stock panel
- `dashboard-equipment.js` — Equipment cards
- `dashboard-map.js` — Leaflet map, deliveries, quick actions

## Accessibility

- Uses `role="region"` and `aria-label` where appropriate
- Ensure `:focus-visible` styles on interactive elements
- Respect `prefers-reduced-motion` for map/animations
