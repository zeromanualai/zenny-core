-- =====================================================
-- Zenny Core — Supabase Database Setup
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- TABLES
-- =====================================================

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  industry TEXT NOT NULL DEFAULT 'ecommerce',
  platform TEXT NOT NULL CHECK (platform IN ('shopify','woocommerce')),

  config_json JSONB NOT NULL DEFAULT '{}',
  agent_name TEXT DEFAULT 'Zenny',
  welcome_message TEXT,
  tone TEXT DEFAULT 'friendly_professional',
  primary_color TEXT DEFAULT '#6366F1',

  -- Commerce credentials (encrypted at application layer)
  shopify_domain TEXT,
  shopify_access_token TEXT,
  woocommerce_url TEXT,
  woocommerce_consumer_key TEXT,
  woocommerce_consumer_secret TEXT,
  stripe_account_id TEXT,

  -- Channels
  channels_enabled JSONB DEFAULT '{"web": true}',
  whatsapp_number TEXT,
  messenger_page_id TEXT,

  -- Operations
  business_hours JSONB,
  escalation_email TEXT,
  timezone TEXT DEFAULT 'UTC',
  return_policy_days INT DEFAULT 30,

  -- Voiceflow mapping
  voiceflow_project_id TEXT,

  -- Plan & limits
  plan TEXT DEFAULT 'starter',
  monthly_conversation_limit INT DEFAULT 2000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge Base chunks
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(768),
  source_url TEXT,
  source_type TEXT DEFAULT 'pdf',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  freshness_score DECIMAL(3,2) DEFAULT 1.00,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  user_email TEXT,
  user_phone TEXT,
  channel TEXT DEFAULT 'web',
  transcript JSONB DEFAULT '[]',
  llm_cost_usd DECIMAL(10,6) DEFAULT 0,
  model_used TEXT,
  policy_decisions JSONB DEFAULT '[]',
  resolved BOOLEAN DEFAULT FALSE,
  escalated BOOLEAN DEFAULT FALSE,
  satisfaction_score INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Action logs (immutable)
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  conversation_id UUID REFERENCES conversations(id),
  action_name TEXT NOT NULL,
  payload JSONB,
  response_json JSONB,
  success BOOLEAN,
  latency_ms INT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prompt overrides
CREATE TABLE prompt_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  prompt_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  override_content TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "tenant_isolation_clients" ON clients
  FOR ALL USING (id = current_setting('app.current_client_id')::UUID);

CREATE POLICY "tenant_isolation_kb" ON kb_chunks
  FOR ALL USING (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY "tenant_isolation_conversations" ON conversations
  FOR ALL USING (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY "tenant_isolation_actions" ON action_logs
  FOR ALL USING (client_id = current_setting('app.current_client_id')::UUID);

CREATE POLICY "tenant_isolation_prompts" ON prompt_overrides
  FOR ALL USING (client_id = current_setting('app.current_client_id')::UUID);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(client_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_client_id', client_id::TEXT, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vector similarity search for KB
CREATE OR REPLACE FUNCTION match_kb_chunks(
  query_embedding VECTOR(768),
  match_threshold FLOAT,
  match_count INT,
  p_client_id UUID
)
RETURNS TABLE(
  id UUID,
  content TEXT,
  similarity FLOAT,
  source_url TEXT,
  metadata JSONB
) AS $$
BEGIN
  PERFORM set_config('app.current_client_id', p_client_id::TEXT, TRUE);

  RETURN QUERY
  SELECT
    kb_chunks.id,
    kb_chunks.content,
    1 - (kb_chunks.embedding <=> query_embedding) AS similarity,
    kb_chunks.source_url,
    kb_chunks.metadata
  FROM kb_chunks
  WHERE kb_chunks.client_id = p_client_id
    AND 1 - (kb_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY kb_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_kb_chunks_client_id ON kb_chunks(client_id);
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_conversations_client_id ON conversations(client_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_action_logs_client_id ON action_logs(client_id);
CREATE INDEX idx_action_logs_created_at ON action_logs(created_at DESC);

-- =====================================================
-- DONE
-- =====================================================
