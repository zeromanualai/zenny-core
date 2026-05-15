import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { LLMRequest, LLMResponse } from '../types';
import { getCache, setCache } from './redis';
import { config } from '../config';
import { supabase } from './db';

// Model configurations (costs per 1M tokens)
const MODELS = {
  T1: {
    name: 'gemini-2.5-flash-lite-preview-06-17',
    provider: 'google' as const,
    inputCost: 0.15,
    outputCost: 0.35,
    maxTokens: 500,
  },
  T2: {
    name: 'deepseek-chat',
    provider: 'deepseek' as const,
    inputCost: 0.20,
    outputCost: 0.60,
    maxTokens: 2000,
  },
  T3: {
    name: 'gemini-2.5-pro-preview-06-05',
    provider: 'google' as const,
    inputCost: 1.25,
    outputCost: 2.25,
    maxTokens: 4000,
  },
};

const googleAI = new GoogleGenerativeAI(config.llm.geminiApiKey);

export async function routeLLM(request: LLMRequest): Promise<LLMResponse> {
  const { intent, complexity, context, message, history, kb_context } = request;

  // 1. Check cache for identical requests
  const cacheKey = hashRequest(request);
  const cached = await getCache(cacheKey);
  if (cached) {
    return { ...cached, model_used: `${cached.model_used} (cached)` };
  }

  // 2. Determine tier
  let tier: 'T1' | 'T2' | 'T3' = 'T1';

  if (context.clientTier === 'enterprise' ||
      ['dispute', 'legal', 'fraud_review'].includes(intent)) {
    tier = 'T3';
  } else if (
    ['refund_logic', 'technical_debug', 'compare_products', 'calendar_conflict'].includes(intent) ||
    complexity > 0.7
  ) {
    tier = 'T2';
  }

  const model = MODELS[tier];

  // 3. Build prompt
  const prompt = buildPrompt(request, model.maxTokens);

  // 4. Execute
  let response: LLMResponse;

  if (model.provider === 'google') {
    response = await callGemini(model.name, prompt, request.client_id);
  } else {
    response = await callDeepSeek(model.name, prompt);
  }

  // 5. Cache T1 responses for 24 hours
  if (tier === 'T1') {
    await setCache(cacheKey, response, 86400);
  }

  // 6. Log cost to database
  await logLLMCost(request.client_id, model, response.tokens_used);

  return response;
}

function buildPrompt(request: LLMRequest, maxTokens: number): string {
  const { message, history, kb_context, context } = request;

  const historyText = history && history.length > 0
    ? history.slice(-5).map(h => `${h.role}: ${h.content}`).join('
')
    : 'No previous messages.';

  const basePrompt = `You are ${context.agentName || 'Zenny'}, the support assistant for ${context.brandName || 'our store'}.
Tone: ${context.tone || 'friendly and professional'}.
Current time: ${new Date().toISOString()}.

Guidelines:
- Always confirm the order number before providing details when relevant
- Never promise delivery dates not in tracking data
- For returns, mention the policy window if applicable
- Answer based ONLY on the provided context and knowledge base
- If you don't have enough information, say "Let me connect you with our team"
- Never make up order numbers, tracking numbers, or policies
- Keep responses concise (under 3 sentences when possible)
- Be helpful but do not overshare sensitive information

${kb_context ? `Context from knowledge base:
${kb_context}
` : ''}

Conversation history:
${historyText}

Customer: ${message}
Assistant:`;

  return basePrompt;
}

async function callGemini(
  modelName: string,
  prompt: string,
  clientId: string
): Promise<LLMResponse> {
  const model = googleAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  // Estimate tokens (rough approximation: 1 token ≈ 4 chars)
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(text.length / 4);

  const costUsd = (inputTokens * MODELS.T1.inputCost + outputTokens * MODELS.T1.outputCost) / 1_000_000;

  return {
    content: text,
    model_used: modelName,
    tokens_used: { input: inputTokens, output: outputTokens },
    cost_usd: costUsd,
  };
}

async function callDeepSeek(modelName: string, prompt: string): Promise<LLMResponse> {
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${config.llm.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const data = response.data;
  const content = data.choices[0].message.content;
  const usage = data.usage;

  const costUsd = (usage.prompt_tokens * MODELS.T2.inputCost + usage.completion_tokens * MODELS.T2.outputCost) / 1_000_000;

  return {
    content,
    model_used: modelName,
    tokens_used: { input: usage.prompt_tokens, output: usage.completion_tokens },
    cost_usd: costUsd,
  };
}

function hashRequest(req: LLMRequest): string {
  const str = `${req.client_id}:${req.intent}:${req.message.slice(0, 100)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `llm:${Math.abs(hash).toString(36)}`;
}

async function logLLMCost(
  clientId: string,
  model: any,
  tokens: { input: number; output: number }
) {
  const cost = (tokens.input * model.inputCost + tokens.output * model.outputCost) / 1_000_000;
  console.log(`[LLM Cost] Client: ${clientId}, Model: ${model.name}, Cost: $${cost.toFixed(6)}`);

  // Optionally store in Supabase for analytics
  try {
    await supabase.from('conversations').insert({
      client_id: clientId,
      llm_cost_usd: cost,
      model_used: model.name,
      transcript: [],
    });
  } catch (e) {
    // Silent fail for logging
  }
}
