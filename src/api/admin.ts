import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../services/db';
import { config } from '../config';

export async function registerAdminRoutes(app: FastifyInstance) {

  // Simple auth middleware for admin routes
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;

    // Only protect admin routes
    if (request.url.startsWith('/admin') || request.url.startsWith('/v1/admin')) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${config.security.adminPassword}`) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  // List all clients
  app.get('/admin/clients', async () => {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  });

  // Get single client details
  app.get('/admin/clients/:slug', async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };
    const { data, error } = await supabase.from('clients').select('*').eq('slug', slug).single();
    if (error || !data) return { error: 'Not found' };
    return data;
  });

  // Get conversations for a client
  app.get('/admin/clients/:slug/conversations', async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };

    const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
    if (!client) return { error: 'Client not found' };

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  });

  // Get single conversation (replay)
  app.get('/admin/clients/:slug/replay/:conversationId', async (request: FastifyRequest) => {
    const { conversationId } = request.params as { conversationId: string };

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error || !data) return { error: 'Conversation not found' };
    return data;
  });

  // Get KB chunks for a client
  app.get('/admin/clients/:slug/kb', async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };

    const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
    if (!client) return { error: 'Client not found' };

    const { data, error } = await supabase
      .from('kb_chunks')
      .select('id, content, source_url, source_type, last_updated, metadata')
      .eq('client_id', client.id)
      .order('last_updated', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  });

  // Get action logs for a client
  app.get('/admin/clients/:slug/actions', async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };

    const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
    if (!client) return { error: 'Client not found' };

    const { data, error } = await supabase
      .from('action_logs')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  });

  // Analytics endpoint
  app.get('/admin/analytics/:slug', async (request: FastifyRequest) => {
    const { slug } = request.params as { slug: string };

    const { data: client } = await supabase.from('clients').select('id').eq('slug', slug).single();
    if (!client) return { error: 'Client not found' };

    // Conversation stats
    const { data: convoStats } = await supabase
      .from('conversations')
      .select('resolved, escalated, llm_cost_usd, model_used')
      .eq('client_id', client.id);

    const total = convoStats?.length || 0;
    const resolved = convoStats?.filter(c => c.resolved).length || 0;
    const escalated = convoStats?.filter(c => c.escalated).length || 0;
    const totalCost = convoStats?.reduce((sum, c) => sum + (c.llm_cost_usd || 0), 0) || 0;

    // Model usage breakdown
    const modelUsage: Record<string, number> = {};
    convoStats?.forEach(c => {
      const model = c.model_used || 'unknown';
      modelUsage[model] = (modelUsage[model] || 0) + 1;
    });

    return {
      client_slug: slug,
      total_conversations: total,
      resolved_count: resolved,
      escalated_count: escalated,
      containment_rate: total > 0 ? ((total - escalated) / total * 100).toFixed(1) + '%' : '0%',
      total_llm_cost_usd: totalCost.toFixed(4),
      avg_cost_per_conversation: total > 0 ? (totalCost / total).toFixed(6) : '0',
      model_usage: modelUsage,
    };
  });
}
