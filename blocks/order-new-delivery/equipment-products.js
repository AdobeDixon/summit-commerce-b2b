export const EQUIPMENT_PRODUCTS = [
  {
    label: 'CHEP UK Wooden Pallet 1200 x 1000 mm',
    sku: 'CHEP-UK-WOOD-1200X1000-01',
    material: 'wood',
  },
  {
    label: 'CHEP European Wooden Pallet 1200 x 800 mm',
    sku: 'CHEP-EU-WOOD-1200X800-03',
    material: 'wood',
  },
  {
    label: 'CHEP Wooden & Metal Pallet 800 x 600 mm',
    sku: 'CHEP-WOOD-METAL-800X600-08',
    material: 'wood-metal',
  },
  {
    label: 'CHEP Plastic Pallet 1200 x 800 mm',
    sku: 'CHEP-PLASTIC-1200X800-01120',
    material: 'plastic',
  },
  {
    label: 'CHEP Plastic Pallet 1200 x 1000 mm with Top-deck Lips',
    sku: 'CHEP-PLASTIC-1200X1000-LIPS-00077',
    material: 'plastic',
  },
  {
    label: 'CHEP Plastic Quarter Display Pallet 600 x 400 mm',
    sku: 'CHEP-PLASTIC-QTR-600X400-16',
    material: 'plastic',
  },
];

export const EQUIPMENT_PRODUCT_MAP = Object.freeze(
  EQUIPMENT_PRODUCTS.reduce((products, product) => {
    products[product.sku] = product;
    return products;
  }, {}),
);

export function getEquipmentProductBySku(sku) {
  return EQUIPMENT_PRODUCT_MAP[sku] || null;
}
