/**
 * Bodea Dashboard Configuration
 *
 * Central configuration for the dashboard block. Update these values to
 * change featured equipment, stock thresholds, navigation items, and map settings.
 */

/**
 * Stock level below which an item is considered "low stock".
 * TODO: Connect to Commerce inventory threshold config when MSI API is available.
 */
export const LOW_STOCK_THRESHOLD = 250;

/**
 * Featured masonry SKUs (Commerce catalog). HCS-BR-* = Heavy Construction Supplies brick lines.
 */
export const FEATURED_EQUIPMENT_SKUS = [
  'HCS-BR-FAC-WIRECUT-P450',
  'HCS-BR-ENG-CLASSAB-P350',
  'HCS-BR-CMU-SOLID-P450',
  'HCS-BR-COM-UTILITY-P450',
  'HCS-BR-PRF-MULTICELL-P450',
  'HCS-BR-AIR-VENT-P030',
];

/** Primary SKU for demo low-stock / notifications (first featured line). */
export const PRIMARY_EQUIPMENT_SKU = FEATURED_EQUIPMENT_SKUS[0];

/**
 * Product titles for Commerce name field and UI (short format: Type (detail) – Standard Size, Pack of ~n).
 */
export const EQUIPMENT_CATALOG_NAMES = {
  'HCS-BR-FAC-WIRECUT-P450':
    'Facing Brick (Wirecut) – Standard Size, Pack of ~450',
  'HCS-BR-ENG-CLASSAB-P350':
    'Engineering Brick (Class A/B) – Standard Size, Pack of ~350',
  'HCS-BR-CMU-SOLID-P450':
    'Concrete Brick – Standard Size, Pack of ~450',
  'HCS-BR-COM-UTILITY-P450':
    'Common Brick – Standard Size, Pack of ~450',
  'HCS-BR-PRF-MULTICELL-P450':
    'Perforated Brick – Standard Size, Pack of ~450',
  'HCS-BR-AIR-VENT-P030':
    'Air Brick (Ventilation) – Standard Size, Pack of ~30',
};

/**
 * Dashboard card labels (same as catalog titles; fallback if Commerce name is unavailable).
 */
export const EQUIPMENT_DISPLAY_NAMES = { ...EQUIPMENT_CATALOG_NAMES };

/**
 * Legacy CHEP pallet SKUs → canonical HCS-BR SKUs (Commerce migration; see scripts).
 */
export const LEGACY_EQUIPMENT_SKU_MIGRATION = [
  { from: 'CHEP-UK-WOOD-1200X1000-01', to: 'HCS-BR-FAC-WIRECUT-P450' },
  { from: 'CHEP-EU-WOOD-1200X800-03', to: 'HCS-BR-ENG-CLASSAB-P350' },
  { from: 'CHEP-WOOD-METAL-800X600-08', to: 'HCS-BR-CMU-SOLID-P450' },
  { from: 'CHEP-PLASTIC-1200X800-01120', to: 'HCS-BR-COM-UTILITY-P450' },
  { from: 'CHEP-PLASTIC-1200X1000-LIPS-00077', to: 'HCS-BR-PRF-MULTICELL-P450' },
  { from: 'CHEP-PLASTIC-QTR-600X400-16', to: 'HCS-BR-AIR-VENT-P030' },
];

/**
 * Intermediate masonry SKUs (HCS-MSY-*) → canonical HCS-BR-* (after earlier migration).
 */
export const EQUIPMENT_MSY_TO_BR_SKU_MIGRATION = [
  { from: 'HCS-MSY-FAC-215102565-450', to: 'HCS-BR-FAC-WIRECUT-P450' },
  { from: 'HCS-MSY-ENG-215102565-350', to: 'HCS-BR-ENG-CLASSAB-P350' },
  { from: 'HCS-MSY-CMU-215102565-450', to: 'HCS-BR-CMU-SOLID-P450' },
  { from: 'HCS-MSY-COM-215102565-450', to: 'HCS-BR-COM-UTILITY-P450' },
  { from: 'HCS-MSY-PRF-215102565-450', to: 'HCS-BR-PRF-MULTICELL-P450' },
  { from: 'HCS-MSY-AIR-215065-040', to: 'HCS-BR-AIR-VENT-P030' },
];

/**
 * Placeholder stock capacity values per SKU for visual progress bars.
 *
 * DATA NOTE: Precise inventory quantities require the Magento Inventory (MSI)
 * API or a warehouse management integration. The `only_x_left_in_stock` field
 * from the products GraphQL query is used when available. These capacity values
 * are used as the denominator for the stock level bar only.
 */
export const EQUIPMENT_STOCK_CAPACITY = {
  'HCS-BR-FAC-WIRECUT-P450': 500,
  'HCS-BR-ENG-CLASSAB-P350': 400,
  'HCS-BR-CMU-SOLID-P450': 500,
  'HCS-BR-COM-UTILITY-P450': 500,
  'HCS-BR-PRF-MULTICELL-P450': 500,
  'HCS-BR-AIR-VENT-P030': 60,
};

/**
 * Left-hand navigation items.
 * `id` is used for active state detection (matched against pathname).
 */
export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    matchPaths: ['/', '/dashboard'],
    icon: 'dashboard',
  },
  {
    id: 'orders',
    label: 'Orders',
    href: '/order-list',
    matchPaths: ['/order-list', '/customer/orders', '/customer/order-details'],
    icon: 'orders',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    href: '/invoices',
    matchPaths: ['/invoices', '/customer/invoices'],
    icon: 'invoices',
  },
  {
    id: 'company-users',
    label: 'Company Users',
    href: '/users',
    matchPaths: ['/users'],
    icon: 'companyUsers',
  },
  {
    id: 'equipment',
    label: 'Equipment',
    href: '/order',
    matchPaths: ['/order', '/order-new-delivery', '/equipment'],
    icon: 'equipment',
  },
  {
    id: 'locations',
    label: 'Locations',
    href: '/locations',
    matchPaths: ['/locations'],
    icon: 'locations',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/order-list',
    matchPaths: ['/reports'],
    icon: 'reports',
  },
  {
    id: 'support',
    label: 'Support',
    href: '/support',
    matchPaths: ['/support'],
    icon: 'support',
  },
];

/**
 * Quick action buttons rendered in the Quick Actions card.
 * `primary` flags the primary CTA with accent styling.
 */
export const QUICK_ACTIONS = [
  {
    id: 'create-order',
    label: 'Create New Order',
    href: '/order',
    icon: 'plus',
    primary: true,
  },
  {
    id: 'manage-inventory',
    label: 'Manage Inventory',
    href: '/customer/account',
    icon: 'inventory',
  },
  {
    id: 'view-orders',
    label: 'View All Orders',
    href: '/order-list',
    icon: 'orders',
  },
  {
    id: 'view-locations',
    label: 'View Locations',
    href: '/locations',
    icon: 'locations',
  },
];

/**
 * Map configuration.
 * Uses Leaflet.js from jsDelivr + OpenStreetMap tiles (no API key required).
 * To swap providers, update tileUrl / attribution / subdomains here.
 */
export const MAP_CONFIG = {
  /** Geographic centre of the UK */
  center: [54.2, -2.5],
  zoom: 5,
};

/**
 * Optional manual map coordinates keyed by delivery site id (Commerce address uid).
 * Markers are normally resolved via OpenStreetMap Nominatim from address fields;
 * add entries here only when you need to override geocoding for a specific address.
 */
export const SITE_COORDINATES = {};

/**
 * Magento order statuses considered "active" (in-progress, not yet fulfilled).
 * Used to derive the Active Orders KPI count.
 */
export const ACTIVE_ORDER_STATUSES = [
  'pending',
  'pending_payment',
  'payment_review',
  'processing',
  'holded',
  'fraud',
];

/**
 * Magento order statuses mapped to dashboard display labels and visual variants.
 */
export const ORDER_STATUS_MAP = {
  pending: { label: 'Pending', variant: 'warning' },
  pending_payment: { label: 'Pending Payment', variant: 'warning' },
  payment_review: { label: 'Payment Review', variant: 'warning' },
  processing: { label: 'Processing', variant: 'info' },
  holded: { label: 'On Hold', variant: 'alert' },
  complete: { label: 'Complete', variant: 'positive' },
  closed: { label: 'Closed', variant: 'neutral' },
  canceled: { label: 'Cancelled', variant: 'neutral' },
  fraud: { label: 'Suspected Fraud', variant: 'alert' },
};
