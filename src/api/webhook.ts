import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClientBySlug, logConversation } from '../services/db';
import { getSession, saveSession } from '../services/redis';
import { routeLLM } from '../services/llm-router';
import { policyGuard } from '../services/policy-guard';
import { queryKB } from '../services/rag';
import { stateManager } from '../services/state-manager';
import { WebhookPayload } from '../types';

export async function registerWebhookRoutes(app: FastifyInstance) {

  // Main Voiceflow webhook — handles all intents
  app.post('/v1/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as WebhookPayload;
    const { client_id, user_id, message, intent, session_context } = body;

    if (!client_id || !message) {
      return reply.status(400).send({ error: 'Missing client_id or message' });
    }

    try {
      const client = await getClientBySlug(client_id);
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      // Get or create session
      const session = await stateManager.getSession(client.id, user_id, 'web');
      await stateManager.incrementTurn(session);

      // Merge any slots from Voiceflow session context
      if (session_context?.slots) {
        await stateManager.updateSlots(session, session_context.slots);
      }

      // 1. Policy Guard for sensitive intents
      const detectedIntent = intent || 'general';
      let policyDecision = null;

      if (['refund_request', 'return_request', 'cancel_subscription'].includes(detectedIntent)) {
        const actionType = detectedIntent === 'cancel_subscription' ? 'CANCEL_SUBSCRIPTION' : 'REFUND';
        policyDecision = await policyGuard.evaluate(actionType, {
          order: session.slots?.order,
          user: { verified: session.slots?.verified || false, vip: session.slots?.vip },
          subscription: session.slots?.subscription,
          clientPolicy: {
            max_return_days: client.return_policy_days,
            require_verification_above: 500,
          },
        });

        if (!policyDecision.allowed) {
          await stateManager.addTranscriptMessage(
            session,
            'assistant',
            policyDecision.suggestion || "I'm unable to process this. Let me connect you with our team."
          );
          await saveSession(client.id, user_id, session);

          return reply.send({
            reply: policyDecision.suggestion || "I'm unable to process this. Let me connect you with our team.",
            escalate: policyDecision.escalate || false,
            policy_reason: policyDecision.reason,
            policy_decision: policyDecision,
          });
        }
      }

      // 2. Query KB if needed
      let kbContext = '';
      if (['faq', 'product_question', 'return_request', 'policy_question', 'general'].includes(detectedIntent)) {
        const chunks = await queryKB(client.id, message, 3, 0.7);
        kbContext = chunks.map(c => `Source: ${c.source_url || 'KB'}\n${c.content}`).join('\n\n---\n\n');
      }

      // 3. Call LLM Router
      const llmResponse = await routeLLM({
        client_id: client.id,
        user_id,
        message,
        intent: detectedIntent,
        complexity: session_context?.turn_count && session_context.turn_count > 3 ? 0.6 : 0.3,
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

      // 4. Update session
      await stateManager.addTranscriptMessage(session, 'user', message);
      await stateManager.addTranscriptMessage(session, 'assistant', llmResponse.content, {
        model_used: llmResponse.model_used,
        cost_usd: llmResponse.cost_usd,
      });

      // 5. Log conversation (async, don't block)
      logConversation(client.id, user_id, 'web', session.transcript || [], llmResponse, policyDecision ? [policyDecision] : undefined).catch(console.error);

      return reply.send({
        reply: llmResponse.content,
        model_used: llmResponse.model_used,
        cost_usd: llmResponse.cost_usd,
        escalate: false,
        policy_decision: policyDecision,
      });

    } catch (error: any) {
      console.error('Webhook error:', error);
      return reply.status(500).send({
        reply: "I'm having trouble right now. Let me connect you with our team.",
        escalate: true,
        error: error.message,
      });
    }
  });

  // Intent classification endpoint (used by Voiceflow before routing)
  app.post('/v1/webhook/classify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { client_id: string; user_id: string; message: string };
    const { message } = body;

    if (!message) {
      return reply.status(400).send({ error: 'Missing message' });
    }

    // Simple rule-based intent classification
    const msg = message.toLowerCase();
    let intent = 'general';
    let complexity = 0.3;

    if (/order|track|shipping|where is|status/.test(msg)) {
      intent = 'order_status';
    } else if (/return|refund|money back|send back/.test(msg)) {
      intent = 'return_request';
      complexity = 0.6;
    } else if (/cancel|stop|unsubscribe|end subscription/.test(msg)) {
      intent = 'cancel_subscription';
      complexity = 0.5;
    } else if (/book|schedule|appointment|demo|call/.test(msg)) {
      intent = 'booking';
      complexity = 0.5;
    } else if (/human|agent|speak to|talk to|real person/.test(msg)) {
      intent = 'human';
    } else if (/price|cost|how much|discount|coupon/.test(msg)) {
      intent = 'product_question';
    } else if (/hours|open|close|time|when/.test(msg)) {
      intent = 'faq';
    }

    return reply.send({ intent, complexity, sentiment: 0 });
  });

  // Escalation webhook
  app.post('/v1/webhook/escalate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as WebhookPayload & { transcript?: any[]; reason?: string };
    const { client_id, user_id, transcript, reason } = body;

    try {
      const client = await getClientBySlug(client_id);
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      // Here you would trigger n8n → Zendesk/Slack
      // For now, return acknowledgment
      return reply.send({
        reply: "I'm connecting you with our team. They'll have all the context.",
        escalate: true,
        ticket_created: false,
        reason: reason || 'manual_escalation',
      });
    } catch (error: any) {
      console.error('Escalation error:', error);
      return reply.status(500).send({ error: 'Escalation failed' });
    }
  });
}
