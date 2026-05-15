import { FastifyInstance } from 'fastify';
import { registerWebhookRoutes } from './webhook';
import { registerChannelRoutes } from './channels';
import { registerIngestRoutes } from './ingest';
import { registerAdminRoutes } from './admin';

export async function registerRoutes(app: FastifyInstance) {
  await registerWebhookRoutes(app);
  await registerChannelRoutes(app);
  await registerIngestRoutes(app);
  await registerAdminRoutes(app);
}
