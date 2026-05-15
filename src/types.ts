export interface Client {
  id: string;
  slug: string;
  industry: string;
  platform: 'shopify' | 'woocommerce';
  config_json: Record<string, any>;
  agent_name: string;
  welcome_message: string | null;
  tone: string;
  primary_color: string;
  shopify_domain: string | null;
  shopify_access_token: string | null;
  woocommerce_url: string | null;
  woocommerce_consumer_key: string | null;
  woocommerce_consumer_secret: string | null;
  stripe_account_id: string | null;
  channels_enabled: Record<string, boolean>;
  whatsapp_number: string | null;
  messenger_page_id: string | null;
  business_hours: any;
  escalation_email: string | null;
  timezone: string;
  return_policy_days: number;
  voiceflow_project_id: string | null;
  plan: string;
  monthly_conversation_limit: number;
  created_at: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SessionState {
  client_id: string;
  user_id: string;
  channel: string;
  slots: Record<string, any>;
  intent_history: string[];
  turn_count: number;
  created_at: number;
  last_activity: number;
  transcript?: ConversationMessage[];
}

export interface LLMRequest {
  client_id: string;
  user_id: string;
  message: string;
  intent: string;
  complexity: number;
  sentiment: number;
  context: Record<string, any>;
  kb_context?: string;
  history: ConversationMessage[];
}

export interface LLMResponse {
  content: string;
  model_used: string;
  tokens_used: { input: number; output: number };
  cost_usd: number;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  escalate?: boolean;
  priority?: 'low' | 'medium' | 'high';
  suggestion?: string;
}

export interface ActionPayload {
  action: string;
  params: Record<string, any>;
  client_id: string;
  conversation_id: string;
}

export interface WebhookPayload {
  client_id: string;
  user_id: string;
  message: string;
  intent?: string;
  session_context?: {
    turn_count?: number;
    slots?: Record<string, any>;
  };
}

export interface ChannelPayload {
  client_id: string;
  user_id: string;
  message: string;
  intent?: string;
  from?: string;
  text?: string;
  body?: string;
  session_context?: Record<string, any>;
}

export interface KBChunk {
  id: string;
  content: string;
  similarity: number;
  source_url?: string;
  metadata?: Record<string, any>;
}

export interface EvalCase {
  id: string;
  name: string;
  input: string;
  context: Record<string, any>;
  expected_contains?: string[];
  forbidden_contains?: string[];
  expected_action?: string;
  policy_check?: {
    action: string;
    expected: 'ALLOWED' | 'BLOCKED';
    reason?: string;
  };
  model_tier?: string;
}

export interface EvalResult {
  test: string;
  name: string;
  passed: boolean;
  checks: Array<{
    type: string;
    phrase?: string;
    passed: boolean;
  }>;
  error?: string;
}
