# Summit Commerce B2B (Bodea demo)

This repository is a **demonstration storefront** built on the **Adobe Commerce + Edge Delivery Services B2B boilerplate**. It uses the fictional **Bodea** brand (the standard demo company in Adobe Commerce materials) as a **B2B brick wholesale supplier**: catalog, ordering, company accounts, and logistics-style flows are illustrative only and not a real business.

## About this project

- **Base**: [Adobe Commerce Storefront boilerplate](https://experienceleague.adobe.com/developer/commerce/storefront/get-started/) for Edge Delivery Services with Adobe Commerce drop-ins (cart, checkout, account, B2B purchase orders, negotiable quotes, requisition lists, and related account blocks).
- **Demo brand**: **Bodea** — fictional company; copy, products, and scenarios are for demos and learning.
- **Custom experience blocks** (Bodea-specific UI on top of Commerce APIs):
  - **Bodea Dashboard** (`chep-dashboard`) — Home-style dashboard: left nav, KPIs, recent orders, stock alerts, equipment overview, and a delivery-activity map.
  - **Bodea Orders List** (`chep-orders-list`) — Paginated orders table with status, dates, products, and links to order details; shares navigation patterns with the dashboard.
  - **Order New Delivery** (`order-new-delivery`) — Multi-step wizard to place a delivery order (order type, date, transport, equipment, site and contact, delivery window), backed by Commerce order APIs and catalog configuration.

Other blocks in `blocks/` follow the boilerplate: commerce account, cart, checkout, B2B PO and approval flows, returns, invoices, and content blocks (e.g. cards, carousel, columns). See each block’s `README.md` for details.

## Credits and contact

Built by **Alex Dixon SC** (UK). For questions about this demo implementation, contact **alexanderd@adobe.com**.

---

## Documentation (boilerplate)

Before extending the boilerplate, we recommend the documentation on <https://experienceleague.adobe.com/developer/commerce/storefront/> and more specifically:

1. [Storefront Developer Tutorial](https://experienceleague.adobe.com/developer/commerce/storefront/get-started/)
1. [AEM Docs](https://www.aem.live/docs/)
1. [AEM Developer Tutorial](https://www.aem.live/developer/tutorial)
1. [The Anatomy of an AEM Project](https://www.aem.live/developer/anatomy-of-a-project)
1. [Web Performance](https://www.aem.live/developer/keeping-it-100)
1. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Getting Started

Use the [Site Creator Tool](https://da.live/app/adobe-commerce/storefront-tools/tools/site-creator/site-creator) to quickly spin up your own copy of code and content.

Alternatively, you can follow our [Guide](https://experienceleague.adobe.com/developer/commerce/storefront/get-started/) for a more detailed walkthrough.

## Updating Drop-in dependencies

You may need to update one of the drop-in components, or `@adobe/magento-storefront-event-collector` or `@adobe/magento-storefront-events-sdk` to a new version. Besides checking the release notes for any breaking changes, ensure you also execute the `postinstall` script so that the dependencies in your `scripts/__dropins__` directory are updated to the latest build. This should be run immediately after you update the component, for example:

```bash
npm install @dropins/storefront-cart@2.0. # Updates the storefront-cart dependency in node_modules/
npm run postinstall # Copies scripts from node_modules into scripts/__dropins__
```

This is a custom script which copies files out of `node_modules` and into a local directory which EDS can serve. You must manually run `postinstall` due to a design choice in `npm` which does not execute `postinstall` after you install a _specific_ package.

## Changelog

Major changes are described and documented as part of pull requests and tracked via the `changelog` tag. To keep your project up to date, please follow this list:

<https://github.com/hlxsites/aem-boilerplate-commerce/issues?q=label%3Achangelog+is%3Aclosed>
