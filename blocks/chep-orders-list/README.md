# CHEP Orders List Block

## Overview

The CHEP Orders List block displays a paginated table of customer orders with status, date, products, and links to order details. Uses Commerce order API and shares nav with CHEP Dashboard.

## DA.live Integration

- Content in block cells (optional)
- Block config: `page-size` (default 10, max 50)

## Block Config (readBlockConfig)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `page-size` | number | 10 | Orders per page (1–50) |

## Behavior

- Paginated list with skeleton loading
- Links to order detail pages via `CUSTOMER_ORDER_DETAILS_PATH`
- Product preview icons from equipment SKU mapping

## Accessibility

- Table semantics for order list
- Ensure `:focus-visible` on links and buttons
