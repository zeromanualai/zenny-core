import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClientBySlug, logConversation } from '../services/db';
import { getSession, saveSession } from '../services/redis';
import { routeLLM } from '../services/llm-router';
import { policyGuard } from '../services/policy-guard';
import { queryKB } from '../services/rag';
import { stateManager } from '../services/state-manager';
import { ChannelPayload } from '../types';

export async function registerChannelRoutes(app: FastifyInstance) {

  // Unified channel handler
  app.post('/v1/channel/:channel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { channel } = request.params as { channel: string };
    const body = request.body as ChannelPayload;

    const normalized = normalizePayload(channel, body);
    const { client_id, user_id, message, intent } = normalized;

    if (!client_id || !message) {
      return reply.status(400).send({ error: 'Missing client_id or message' });
    }

    try {
      const client = await getClientBySlug(client_id);
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      // Check if channel is enabled
      if (!client.channels_enabled?.[channel]) {
        return reply.status(403).send({ error: `Channel ${channel} not enabled for this client` });
      }

      const session = await stateManager.getSession(client.id, user_id, channel);
      await stateManager.incrementTurn(session);

      // Policy Guard
      let policyDecision = null;
      if (['refund_request', 'return_request', 'cancel_subscription'].includes(intent || '')) {
        const actionType = intent === 'cancel_subscription' ? 'CANCEL_SUBSCRIPTION' : 'REFUND';
        policyDecision = await policyGuard.evaluate(actionType, {
          order: session.slots?.order,
          user: { verified: session.slots?.verified || false },
          clientPolicy: { max_return_days: client.return_policy_days },
        });

        if (!policyDecision.allowed) {
          await stateManager.addTranscriptMessage(session, 'assistant', policyDecision.suggestion || 'Unable to process.');
          await saveSession(client.id, user_id, session);
          return reply.send({ reply: policyDecision.suggestion, escalate: policyDecision.escalate });
        }
      }

      // KB Query
      let kbContext = '';
      if (!intent || ['faq', 'product_question', 'general'].includes(intent)) {
        const chunks = await queryKB(client.id, message, 3);
        kbContext = chunks.map(c => c.content).join('\n---\n');
      }

      // LLM
      const llmResponse = await routeLLM({
        client_id: client.id,
        user_id,
        message,
        intent: intent || 'general',
        complexity: 0.3,
        sentiment: 0,
        context: {
          agentName: client.agent_name,
          brandName: client.slug,
          tone: client.tone,
          clientTier: client.plan,
        },
        kb_context: kbContext,
        history: session.transcript || [],
      });

      await stateManager.addTranscriptMessage(session, 'user', message);
      await stateManager.addTranscriptMessage(session, 'assistant', llmResponse.content);
      await saveSession(client.id, user_id, session);

      logConversation(client.id, user_id, channel, session.transcript || [], llmResponse).catch(console.error);

      return reply.send({
        reply: llmResponse.content,
        channel,
        model_used: llmResponse.model_used,
      });

    } catch (error: any) {
      console.error(`Channel ${channel} error:`, error);
      return reply.status(500).send({ reply: 'Error processing message.', escalate: true });
    }
  });

  // Legacy individual channel endpoints (backward compat)
  app.post('/v1/channel/web', handleLegacyChannel('web'));
  app.post('/v1/channel/whatsapp', handleLegacyChannel('whatsapp'));
  app.post('/v1/channel/email', handleLegacyChannel('email'));
  app.post('/v1/channel/messenger', handleLegacyChannel('messenger'));
}

function normalizePayload(channel: string, body: ChannelPayload): ChannelPayload {
  return {
    client_id: body.client_id,
    user_id: body.user_id || body.from || 'anonymous',
    message: body.message || body.text || body.body || '',
    intent: body.intent,
    from: body.from,
    text: body.text,
    body: body.body,
    session_context: body.session_context,
  };
}

function handleLegacyChannel(channel: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as ChannelPayload;
    const normalized = normalizePayload(channel, body);

    return reply.send({ status: 'received', channel, normalized });
  };
}
