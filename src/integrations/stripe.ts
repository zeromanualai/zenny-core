import axios from 'axios';

export async function createStripeRefund(
  stripeAccountId: string,
  paymentIntentId: string,
  amount?: number, // in cents, optional (full refund if omitted)
  reason?: string,
  idempotencyKey?: string
): Promise<any> {
  const url = 'https://api.stripe.com/v1/refunds';

  const params = new URLSearchParams();
  params.append('payment_intent', paymentIntentId);
  if (amount) params.append('amount', amount.toString());
  if (reason) params.append('reason', reason);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ''}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (stripeAccountId) {
    headers['Stripe-Account'] = stripeAccountId;
  }

  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await axios.post(url, params.toString(), { headers, timeout: 15000 });
  return response.data;
}

export async function getStripeCharge(
  stripeAccountId: string,
  chargeId: string
): Promise<any> {
  const url = `https://api.stripe.com/v1/charges/${chargeId}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY || ''}`,
  };

  if (stripeAccountId) {
    headers['Stripe-Account'] = stripeAccountId;
  }

  const response = await axios.get(url, { headers, timeout: 10000 });
  return response.data;
}
