/**
 * CHEP Dashboard Configuration
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
 * Featured CHEP equipment SKUs displayed in Equipment Overview and Low Stock Alert panels.
 * These are the real Commerce product SKUs created for the MyCHEP platform.
 */
export const FEATURED_EQUIPMENT_SKUS = [
  'CHEP-UK-WOOD-1200X1000-01',
  'CHEP-EU-WOOD-1200X800-03',
  'CHEP-WOOD-METAL-800X600-08',
  'CHEP-PLASTIC-1200X800-01120',
  'CHEP-PLASTIC-1200X1000-LIPS-00077',
  'CHEP-PLASTIC-QTR-600X400-16',
];

/**
 * Display-only labels for featured SKUs (used as fallback if Commerce name is unavailable).
 */
export const EQUIPMENT_DISPLAY_NAMES = {
  'CHEP-UK-WOOD-1200X1000-01': 'CHEP Standard Pallet',
  'CHEP-EU-WOOD-1200X800-03': 'European Wooden Pallet',
  'CHEP-WOOD-METAL-800X600-08': 'Wooden & Metal Pallet',
  'CHEP-PLASTIC-1200X800-01120': 'Plastic Pallet',
  'CHEP-PLASTIC-1200X1000-LIPS-00077': 'Plastic Pallet with Lips',
  'CHEP-PLASTIC-QTR-600X400-16': 'Quarter Display Pallet',
};

/**
 * Placeholder stock capacity values per SKU for visual progress bars.
 *
 * DATA NOTE: Precise inventory quantities require the Magento Inventory (MSI)
 * API or a warehouse management integration. The `only_x_left_in_stock` field
 * from the products GraphQL query is used when available. These capacity values
 * are used as the denominator for the stock level bar only.
 */
export const EQUIPMENT_STOCK_CAPACITY = {
  'CHEP-UK-WOOD-1200X1000-01': 500,
  'CHEP-EU-WOOD-1200X800-03': 500,
  'CHEP-WOOD-METAL-800X600-08': 300,
  'CHEP-PLASTIC-1200X800-01120': 400,
  'CHEP-PLASTIC-1200X1000-LIPS-00077': 400,
  'CHEP-PLASTIC-QTR-600X400-16': 300,
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
 * Approximate geocoordinates for the delivery sites defined in
 * order-new-delivery/sites.js. Keyed by site ID.
 *
 * These are used by the map section to position site markers.
 * For production, geocoordinates should be stored in the site data source.
 */
export const SITE_COORDINATES = {
  'site-manchester-001': [53.4631, -2.2913],
  'site-birmingham-002': [52.4862, -1.8904],
  'site-leeds-003': [53.7965, -1.5478],
  'site-bristol-004': [51.4545, -2.5879],
};

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
