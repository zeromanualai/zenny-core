import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient, getClientBySlug } from '../services/db';
import { ingestDocument } from '../services/rag';

export async function registerIngestRoutes(app: FastifyInstance) {

  // Merchant onboarding endpoint
  app.post('/v1/ingest-config', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;

    try {
      // Validate required fields
      if (!body.slug || !body.platform) {
        return reply.status(400).send({ error: 'Missing required fields: slug, platform' });
      }

      if (!['shopify', 'woocommerce'].includes(body.platform)) {
        return reply.status(400).send({ error: 'Platform must be shopify or woocommerce' });
      }

      // Check if client already exists
      const existing = await getClientBySlug(body.slug);
      if (existing) {
        return reply.status(409).send({ error: 'Client with this slug already exists' });
      }

      // Create client record
      const client = await createClient({
        slug: body.slug,
        platform: body.platform,
        industry: body.industry || 'ecommerce',
        agent_name: body.agent_name || 'Zenny',
        welcome_message: body.welcome_message || null,
        tone: body.tone || 'friendly_professional',
        primary_color: body.primary_color || '#6366F1',
        shopify_domain: body.shopify_domain || null,
        shopify_access_token: body.shopify_access_token || null,
        woocommerce_url: body.woocommerce_url || null,
        woocommerce_consumer_key: body.woocommerce_consumer_key || null,
        woocommerce_consumer_secret: body.woocommerce_consumer_secret || null,
        stripe_account_id: body.stripe_account_id || null,
        channels_enabled: body.channels_enabled || { web: true },
        whatsapp_number: body.whatsapp_number || null,
        messenger_page_id: body.messenger_page_id || null,
        business_hours: body.business_hours || null,
        escalation_email: body.escalation_email || null,
        timezone: body.timezone || 'UTC',
        return_policy_days: body.return_policy_days || 30,
        voiceflow_project_id: body.voiceflow_project_id || null,
        plan: body.plan || 'starter',
        monthly_conversation_limit: body.monthly_conversation_limit || 2000,
        config_json: body.config_json || {},
      });

      if (!client) {
        return reply.status(500).send({ error: 'Failed to create client' });
      }

      // Process KB documents if provided
      if (body.kb_documents && Array.isArray(body.kb_documents)) {
        for (const doc of body.kb_documents) {
          if (doc.content) {
            await ingestDocument(
              client.id,
              doc.content,
              doc.source_url || `onboarding-${Date.now()}`,
              doc.source_type || 'pdf',
              doc.metadata || {}
            );
          }
        }
      }

      return reply.status(201).send({
        success: true,
        client_id: client.id,
        slug: client.slug,
        message: 'Client onboarded successfully. Next: clone Voiceflow template and update project_id.',
      });

    } catch (error: any) {
      console.error('Ingest error:', error);
      return reply.status(500).send({ error: 'Onboarding failed', details: error.message });
    }
  });

  // KB upload endpoint (for existing clients)
  app.post('/v1/ingest-kb/:clientSlug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientSlug } = request.params as { clientSlug: string };
    const body = request.body as any;

    try {
      const client = await getClientBySlug(clientSlug);
      if (!client) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      if (!body.content) {
        return reply.status(400).send({ error: 'Missing content' });
      }

      await ingestDocument(
        client.id,
        body.content,
        body.source_url || `upload-${Date.now()}`,
        body.source_type || 'text',
        body.metadata || {}
      );

      return reply.send({ success: true, message: 'Document ingested into KB' });

    } catch (error: any) {
      console.error('KB ingest error:', error);
      return reply.status(500).send({ error: 'KB ingestion failed' });
    }
  });
}
