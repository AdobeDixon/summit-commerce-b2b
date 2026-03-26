# Commerce Invoices List Block

## Overview

The Commerce Invoices List block displays a paginated table of B2B invoices with status, date, amount, and PDF download. Uses Commerce invoice API and shares nav with CHEP Dashboard.

## DA.live Integration

- Content in block cells (optional)
- Block config: `page-size` (default 10, max 50)

## Block Config (readBlockConfig)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `page-size` | number | 10 | Invoices per page (1–50) |

## Behavior

- Paginated list with skeleton loading
- PDF generation via jspdf (loaded from esm.sh)
- Links to order details where applicable

## Accessibility

- Table semantics
- Ensure `:focus-visible` on links and buttons
