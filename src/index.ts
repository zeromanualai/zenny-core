import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config, validateConfig } from './config';
import { registerRoutes } from './api/routes';

validateConfig();

const app = Fastify({
  logger: true,
  trustProxy: true,
});

// CORS
app.register(cors, {
  origin: true,
  credentials: true,
});

// Swagger documentation
app.register(swagger, {
  openapi: {
    info: {
      title: 'Zenny Core API',
      description: 'AI Customer Support Infrastructure',
      version: '1.0.0',
    },
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Webhook', description: 'Voiceflow and channel webhooks' },
      { name: 'Channels', description: 'Channel-specific endpoints' },
      { name: 'Ingest', description: 'Configuration ingestion' },
      { name: 'Admin', description: 'Internal admin dashboard' },
    ],
  },
});

app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// Health check
app.get('/health', async () => ({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

// Register all routes
registerRoutes(app);

// Global error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    code: error.code || 'INTERNAL_ERROR',
  });
});

// Start server
const PORT = config.server.port;
const HOST = config.server.host;

app.listen({ port: PORT, host: HOST }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Zenny Core running on ${HOST}:${PORT}`);
});
