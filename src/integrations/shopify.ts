import axios from 'axios';
import { config } from '../config';

const SHOPIFY_API_VERSION = config.integrations.shopifyApiVersion;

export async function getShopifyOrders(
  shopDomain: string,
  accessToken: string,
  params: { email?: string; order_id?: string; limit?: number }
): Promise<any> {
  const url = `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/orders.json`;

  const queryParams: Record<string, any> = {
    limit: params.limit || 5,
    status: 'any',
  };

  if (params.email) {
    queryParams.email = params.email;
  }

  if (params.order_id) {
    queryParams.name = params.order_id.startsWith('#') ? params.order_id : `#${params.order_id}`;
  }

  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    params: queryParams,
    timeout: 10000,
  });

  return response.data.orders || [];
}

export async function getShopifyOrder(
  shopDomain: string,
  accessToken: string,
  orderId: string
): Promise<any> {
  const url = `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;

  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  return response.data.order;
}

export async function getShopifyProducts(
  shopDomain: string,
  accessToken: string,
  limit = 10
): Promise<any[]> {
  const url = `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/products.json`;

  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    params: { limit },
    timeout: 10000,
  });

  return response.data.products || [];
}

export async function getShopifyCustomer(
  shopDomain: string,
  accessToken: string,
  email: string
): Promise<any | null> {
  const url = `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/customers/search.json`;

  const response = await axios.get(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    params: { query: `email:${email}`, limit: 1 },
    timeout: 10000,
  });

  const customers = response.data.customers || [];
  return customers.length > 0 ? customers[0] : null;
}

export function formatOrderForResponse(order: any): string {
  if (!order) return 'No order found.';

  const items = order.line_items?.map((item: any) =>
    `- ${item.title} (x${item.quantity}) — $${item.price}`
  ).join('\n') || 'No items';

  const tracking = order.fulfillments?.[0]
    ? `\nTracking: ${order.fulfillments[0].tracking_company || 'Carrier'} ${order.fulfillments[0].tracking_number || 'N/A'}`
    : '\nNot yet shipped.';

  return `Order ${order.name}\nStatus: ${order.fulfillment_status || 'Unfulfilled'}\nTotal: $${order.total_price}\nItems:\n${items}${tracking}`;
}
