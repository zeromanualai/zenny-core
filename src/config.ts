import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
  },
  llm: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  },
  voiceflow: {
    dmapiKey: process.env.VOICEFLOW_DMAPI_KEY || '',
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || '',
    secret: process.env.N8N_SECRET || '',
  },
  integrations: {
    shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2024-04',
  },
  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  },
  security: {
    jwtSecret: process.env.JWT_SECRET || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
  },
};

export function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
    'REDIS_HOST',
    'N8N_WEBHOOK_URL',
    'ADMIN_PASSWORD',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn('[CONFIG WARNING] Missing environment variables: ' + missing.join(', '));
    console.warn('[CONFIG WARNING] App will start but some features may not work.');
    // Don't throw — let the app start so Railway healthcheck can at least hit /health
  }
}
