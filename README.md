# Zenny Core

**AI Customer Support Infrastructure for E-Commerce**

Zenny Core is the backend engine powering the Zenny AI support agent. It handles LLM routing, policy enforcement, knowledge base retrieval, session management, and integration orchestration for Shopify and WooCommerce merchants.

> **Status:** Phase 1 — E-Commerce First (Shopify + WooCommerce)

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Voiceflow Pro (Dialogue Orchestrator)  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           Zenny Core API                │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐  │
│  │ Webhook │ │ Channel │ │  Ingest  │  │
│  │ Routes  │ │ Routes  │ │  Routes  │  │
│  └────┬────┘ └────┬────┘ └────┬─────┘  │
│       │           │           │         │
│  ┌────┴───────────┴───────────┴─────┐   │
│  │        Services Layer            │   │
│  │  LLM Router  ·  Policy Guard     │   │
│  │  State Mgr   ·  RAG / KB        │   │
│  │  Action Engine · Redis Cache    │   │
│  └──────────────────────────────────┘   │
│       │           │           │         │
│  ┌────┴───────────┴───────────┴─────┐   │
│  │      Integrations Layer          │   │
│  │  Shopify  ·  Stripe  ·  Zendesk  │   │
│  └──────────────────────────────────┘   │
│       │                                 │
│  ┌────┴────────────────────────────┐    │
│  │  Supabase (DB + pgvector RLS)   │    │
│  │  Redis (Upstash — Sessions)     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Supabase project (with pgvector enabled)
- Upstash Redis
- Google AI Studio API key (Gemini)
- DeepSeek API key
- n8n instance (self-hosted or cloud)

### 2. Install

```bash
git clone <your-repo>
cd zenny-core
npm install
```

### 3. Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 4. Database Setup

Run the SQL in `supabase-setup.sql` in your Supabase SQL Editor.

### 5. Build & Run

```bash
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

### 6. Health Check

```bash
curl http://localhost:3000/health
```

---

## API Endpoints

### Webhooks (Voiceflow)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/webhook` | Main message handler |
| POST | `/v1/webhook/classify` | Intent classification |
| POST | `/v1/webhook/escalate` | Human handoff |

### Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/channel/:channel` | Unified channel handler |
| POST | `/v1/channel/web` | Web widget |
| POST | `/v1/channel/whatsapp` | WhatsApp |
| POST | `/v1/channel/email` | Email |
| POST | `/v1/channel/messenger` | Messenger |

### Ingest

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/ingest-config` | Onboard new merchant |
| POST | `/v1/ingest-kb/:slug` | Upload KB document |

### Admin (Internal Dashboard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/clients` | List all clients |
| GET | `/admin/clients/:slug` | Client details |
| GET | `/admin/clients/:slug/conversations` | Conversation history |
| GET | `/admin/clients/:slug/replay/:id` | Replay conversation |
| GET | `/admin/clients/:slug/kb` | KB chunks |
| GET | `/admin/clients/:slug/actions` | Action logs |
| GET | `/admin/analytics/:slug` | Analytics summary |

---

## Project Structure

```
zenny-core/
├── src/
│   ├── index.ts              # Server entry
│   ├── config.ts             # Environment config
│   ├── types.ts              # TypeScript types
│   ├── api/
│   │   ├── routes.ts           # Route registry
│   │   ├── webhook.ts        # Voiceflow webhooks
│   │   ├── channels.ts       # Channel adapters
│   │   ├── ingest.ts         # Onboarding & KB
│   │   └── admin.ts          # Internal dashboard
│   ├── services/
│   │   ├── db.ts             # Supabase client
│   │   ├── redis.ts          # Redis / sessions
│   │   ├── llm-router.ts     # Tiered LLM routing
│   │   ├── policy-guard.ts   # Deterministic rules
│   │   ├── state-manager.ts  # Session management
│   │   ├── rag.ts            # KB retrieval
│   │   └── action-engine.ts  # n8n integration
│   ├── integrations/
│   │   ├── shopify.ts        # Shopify API
│   │   ├── stripe.ts         # Stripe API
│   │   └── zendesk.ts        # Zendesk API
│   ├── prompts/
│   │   └── ecommerce-v1.0/   # Prompt templates
│   └── evals/
│       ├── suite.ts          # Eval test cases
│       └── runner.ts         # Eval runner
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── railway.json
├── Procfile
├── README.md
└── supabase-setup.sql
```

---

## Evaluation Framework

Run automated regression tests before every deploy:

```bash
npm run test:eval
```

Tests cover:
- Order status responses
- Fraud/refund policy enforcement
- Return eligibility
- After-hours auto-replies
- High-value refund blocks
- Subscription cancellation rules

**CI/CD Rule:** If any eval fails, deploy is blocked.

---

## Cost-First LLM Strategy

| Tier | Model | Role | Traffic |
|------|-------|------|---------|
| T1 | Gemini 2.5 Flash-Lite | FAQ, order status, greetings | ~93–97% |
| T2 | DeepSeek-V4-Flash | Multi-step reasoning, returns | ~2–5% |
| T3 | Gemini 2.5 Pro | High-stakes disputes, fraud | ~0–2% |

Target: <$0.015 per conversation.

---

## Deployment

### Railway (Recommended)

1. Connect GitHub repo to Railway
2. Set environment variables
3. Deploy — healthcheck at `/health`

### Manual

```bash
npm run build
npm start
```

---

## Security

- **Row-Level Security (RLS)** enabled on all tenant tables
- Tenant context set before every query
- Redis sessions with 1-hour TTL
- Admin routes protected by Bearer token
- No credentials in code — all in `.env`

---

## License

MIT — ZeroManual

---

*Built for Phase 1: 10 Shopify/WooCommerce stores. $15K MRR. 8 weeks.*
