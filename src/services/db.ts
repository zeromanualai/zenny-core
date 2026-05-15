import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { Client } from '../types';

export const supabase = createSupabaseClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});

// Set tenant context before every query
export async function withTenant<T>(clientId: string, operation: () => Promise<T>): Promise<T> {
  await supabase.rpc('set_tenant_context', { client_id: clientId });
  return operation();
}

export async function getClientBySlug(slug: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data as Client;
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Client;
}

export async function createClientRecord(clientData: Partial<Client>): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single();

  if (error) {
    console.error('Error creating client:', error);
    return null;
  }
  return data as Client;
}

export async function logConversation(
  clientId: string,
  userId: string,
  channel: string,
  transcript: any[],
  llmResponse: any,
  policyDecisions?: any[]
): Promise<void> {
  try {
    await supabase.from('conversations').insert({
      client_id: clientId,
      user_email: userId,
      channel,
      transcript,
      llm_cost_usd: llmResponse.cost_usd || 0,
      model_used: llmResponse.model_used || 'unknown',
      policy_decisions: policyDecisions || [],
    });
  } catch (e) {
    console.error('Failed to log conversation:', e);
  }
}

export async function logAction(
  clientId: string,
  conversationId: string,
  actionName: string,
  payload: any,
  responseJson: any,
  success: boolean,
  latencyMs: number,
  idempotencyKey: string
): Promise<void> {
  try {
    await supabase.from('action_logs').insert({
      client_id: clientId,
      conversation_id: conversationId,
      action_name: actionName,
      payload,
      response_json: responseJson,
      success,
      latency_ms: latencyMs,
      idempotency_key: idempotencyKey,
    });
  } catch (e) {
    console.error('Failed to log action:', e);
  }
}
