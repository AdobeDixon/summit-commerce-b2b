import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const CUSTOMER_INVOICES_QUERY = `
  query GetCustomerInvoices($currentPage: Int!, $pageSize: Int!) {
    customer {
      firstname
      lastname
      email
      orders(currentPage: $currentPage, pageSize: $pageSize) {
        total_count
        page_info {
          current_page
          total_pages
          page_size
        }
        items {
          id
          number
          order_date
          status
          total {
            grand_total {
              currency
            }
          }
          invoices {
            id
            number
            comments {
              timestamp
            }
            custom_attributes {
              attribute_code
              value
            }
            total {
              grand_total {
                currency
              }
            }
            items {
              id
              product_name
              product_sku
              quantity_invoiced
            }
          }
        }
      }
    }
  }
`;

function getCustomAttributeValue(attributes, keys) {
  if (!Array.isArray(attributes) || !attributes.length) return null;

  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const match = attributes.find((attribute) => (
    normalizedKeys.includes(attribute?.attribute_code?.toLowerCase?.())
      && attribute?.value
  ));

  return match?.value ?? null;
}

function normaliseInvoice(rawInvoice, rawOrder) {
  const createdAt = getCustomAttributeValue(rawInvoice.custom_attributes, [
    'created_at',
    'invoice_date',
    'createdat',
  ]);

  const commentTimestamp = (rawInvoice.comments ?? [])
    .map((comment) => comment?.timestamp)
    .filter(Boolean)
    .sort()[0] ?? null;

  const status = getCustomAttributeValue(rawInvoice.custom_attributes, [
    'state',
    'status',
    'state_label',
    'status_label',
  ]);

  return {
    id: rawInvoice.id,
    number: rawInvoice.number,
    orderId: rawOrder.id,
    orderNumber: rawOrder.number,
    orderDate: rawOrder.order_date ?? null,
    invoiceDate: createdAt ?? commentTimestamp ?? rawOrder.order_date ?? null,
    invoiceStatus: status,
    currency:
      rawInvoice.total?.grand_total?.currency
      ?? rawOrder.total?.grand_total?.currency
      ?? null,
    items: (rawInvoice.items ?? []).map((item) => ({
      id: item.id,
      name: item.product_name ?? 'Product',
      sku: item.product_sku ?? '',
      quantityInvoiced: item.quantity_invoiced ?? 0,
    })),
    hasPdf: Boolean(rawInvoice.number),
  };
}

function sortInvoicesNewestFirst(left, right) {
  const leftTime = left.invoiceDate ? Date.parse(left.invoiceDate) : 0;
  const rightTime = right.invoiceDate ? Date.parse(right.invoiceDate) : 0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return `${right.number}`.localeCompare(`${left.number}`, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export async function fetchInvoicesPage(currentPage = 1, pageSize = 10) {
  let response;

  try {
    response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CUSTOMER_INVOICES_QUERY, {
      method: 'POST',
      variables: {
        currentPage,
        pageSize,
      },
    });
  } catch (err) {
    console.warn('[InvoicesService] Invoices network request failed:', err.message);
    return {
      customer: null,
      invoices: [],
      pagination: {
        currentPage,
        pageSize,
        totalPages: 0,
        totalOrders: 0,
      },
      error: true,
    };
  }

  if (response?.errors?.length) {
    const messages = response.errors.map((error) => error.message).join('; ');
    console.warn('[InvoicesService] Invoices GraphQL errors:', messages);
    return {
      customer: null,
      invoices: [],
      pagination: {
        currentPage,
        pageSize,
        totalPages: 0,
        totalOrders: 0,
      },
      error: true,
    };
  }

  const customer = response?.data?.customer;
  const orders = customer?.orders?.items ?? [];

  return {
    customer: customer ? {
      firstname: customer.firstname ?? '',
      lastname: customer.lastname ?? '',
      email: customer.email ?? '',
    } : null,
    invoices: orders
      .flatMap((order) => (
        (order.invoices ?? []).map((invoice) => normaliseInvoice(invoice, order))
      ))
      .sort(sortInvoicesNewestFirst),
    pagination: {
      currentPage: customer?.orders?.page_info?.current_page ?? currentPage,
      pageSize: customer?.orders?.page_info?.page_size ?? pageSize,
      totalPages: customer?.orders?.page_info?.total_pages ?? 0,
      totalOrders: customer?.orders?.total_count ?? 0,
    },
    error: false,
  };
}
