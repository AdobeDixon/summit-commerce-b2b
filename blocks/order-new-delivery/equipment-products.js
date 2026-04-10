import { EQUIPMENT_CATALOG_NAMES } from '../bodea-dashboard/dashboard-config.js';

export const EQUIPMENT_PRODUCTS = [
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-FAC-WIRECUT-P450'],
    sku: 'HCS-BR-FAC-WIRECUT-P450',
    material: 'clay-facing',
  },
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-ENG-CLASSAB-P350'],
    sku: 'HCS-BR-ENG-CLASSAB-P350',
    material: 'clay-engineering',
  },
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-CMU-SOLID-P450'],
    sku: 'HCS-BR-CMU-SOLID-P450',
    material: 'concrete',
  },
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-COM-UTILITY-P450'],
    sku: 'HCS-BR-COM-UTILITY-P450',
    material: 'clay-common',
  },
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-PRF-MULTICELL-P450'],
    sku: 'HCS-BR-PRF-MULTICELL-P450',
    material: 'clay-perf',
  },
  {
    label: EQUIPMENT_CATALOG_NAMES['HCS-BR-AIR-VENT-P030'],
    sku: 'HCS-BR-AIR-VENT-P030',
    material: 'vent',
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
