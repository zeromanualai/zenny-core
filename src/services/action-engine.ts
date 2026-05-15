import axios from 'axios';
import { config } from '../config';
import { logAction } from './db';

const N8N_BASE_URL = config.n8n.webhookUrl;

export async function callAction(
  actionName: string,
  params: Record<string, any>,
  clientId: string,
  conversationId?: string
): Promise<any> {
  const idempotencyKey = `${clientId}:${actionName}:${JSON.stringify(params)}:${Date.now()}`;
  const startTime = Date.now();

  try {
    const response = await axios.post(
      `${N8N_BASE_URL}/${actionName}`,
      {
        ...params,
        client_id: clientId,
        idempotency_key: idempotencyKey,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          'X-Zenny-Auth': config.n8n.secret,
        },
      }
    );

    const latencyMs = Date.now() - startTime;

    if (conversationId) {
      await logAction(
        clientId,
        conversationId,
        actionName,
        params,
        response.data,
        true,
        latencyMs,
        idempotencyKey
      );
    }

    return response.data;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    console.error(`Action ${actionName} failed:`, error.message);

    if (conversationId) {
      await logAction(
        clientId,
        conversationId,
        actionName,
        params,
        { error: error.message },
        false,
        latencyMs,
        idempotencyKey
      );
    }

    throw new Error(`Integration failed: ${actionName} — ${error.message}`);
  }
}

// Predefined action helpers
export async function lookupShopifyOrder(
  clientId: string,
  params: { email?: string; order_id?: string },
  conversationId?: string
) {
  return callAction('shopify-order-lookup', params, clientId, conversationId);
}

export async function createZendeskTicket(
  clientId: string,
  params: { subject: string; body: string; email: string; priority?: string; subdomain: string; api_token: string },
  conversationId?: string
) {
  return callAction('zendesk-ticket-create', params, clientId, conversationId);
}

export async function findCalendarSlots(
  clientId: string,
  params: { calendar_id: string; date: string; timezone: string },
  conversationId?: string
) {
  return callAction('gcal-find-slots', params, clientId, conversationId);
}

export async function createCalendarEvent(
  clientId: string,
  params: { calendar_id: string; start_time: string; end_time: string; attendee_email: string; summary: string },
  conversationId?: string
) {
  return callAction('gcal-create-event', params, clientId, conversationId);
}

export async function createReturnLabel(
  clientId: string,
  params: { order_id: string; return_address: any; carrier?: string },
  conversationId?: string
) {
  return callAction('shippo-label-create', params, clientId, conversationId);
}

export async function executeStripeRefund(
  clientId: string,
  params: { payment_intent: string; amount?: number; reason?: string },
  conversationId?: string
) {
  return callAction('stripe-refund-execute', params, clientId, conversationId);
}
