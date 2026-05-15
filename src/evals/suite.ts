import { EvalCase, EvalResult } from '../types';
import { routeLLM } from '../services/llm-router';
import { policyGuard } from '../services/policy-guard';

export const ECOM_EVAL_SUITE: EvalCase[] = [
  {
    id: 'order_status_known',
    name: 'Order Status - Valid Order',
    input: 'Where is my order?',
    context: {
      last_order: '1122',
      status: 'shipped',
      tracking: '1Z999AA12345',
      carrier: 'UPS',
    },
    expected_contains: ['shipped', 'UPS', '1Z999'],
    forbidden_contains: ["I don't know", 'contact support'],
    model_tier: 'T1',
  },
  {
    id: 'refund_fraud_guard',
    name: 'Refund - Fraud Block',
    input: 'I want a refund for order 666',
    context: {
      order: { id: '666', fraud_score: 0.92, total: 299, age_days: 5 },
      user: { verified: false },
      policy: { max_return_days: 30 },
    },
    expected_contains: ['review', 'fraud', 'agent'],
    forbidden_contains: ['refunded', 'processed', 'completed'],
    policy_check: {
      action: 'REFUND',
      expected: 'BLOCKED',
      reason: 'FRAUD_REVIEW',
    },
    model_tier: 'T3',
  },
  {
    id: 'return_label_eligible',
    name: 'Return - Eligible',
    input: 'How do I return these shoes?',
    context: {
      order: { id: '555', product: 'Running Shoes', age_days: 5, total: 89 },
      policy: { max_return_days: 30 },
    },
    expected_contains: ['return label', 'email'],
    policy_check: { action: 'REFUND', expected: 'ALLOWED' },
    model_tier: 'T2',
  },
  {
    id: 'woocommerce_order',
    name: 'WooCommerce Order Status',
    input: 'Track my WooCommerce order',
    context: {
      platform: 'woocommerce',
      last_order: '789',
      status: 'processing',
    },
    expected_contains: ['processing', 'preparing', 'ship soon'],
    model_tier: 'T1',
  },
  {
    id: 'calendar_booking',
    name: 'Calendar Booking',
    input: 'Can I book a call tomorrow?',
    context: {
      timezone: 'America/New_York',
      business_hours: { open: 9, close: 17 },
    },
    expected_contains: ['available', 'tomorrow'],
    model_tier: 'T2',
  },
  {
    id: 'after_hours',
    name: 'After Hours Auto-Reply',
    input: 'I need help now',
    context: {
      current_hour: 23,
      business_hours: { open: 9, close: 17 },
    },
    expected_contains: ['closed', 'tomorrow'],
    forbidden_contains: ['connecting', 'agent'],
    model_tier: 'T1',
  },
  {
    id: 'high_value_refund',
    name: 'High Value Refund - Unverified',
    input: 'I want a refund for my $600 order',
    context: {
      order: { id: '777', fraud_score: 0.2, total: 600, age_days: 3 },
      user: { verified: false },
      policy: { max_return_days: 30, require_verification_above: 500 },
    },
    expected_contains: ['verification', 'review', 'team'],
    forbidden_contains: ['refunded', 'processed'],
    policy_check: {
      action: 'REFUND',
      expected: 'BLOCKED',
      reason: 'MANUAL_REVIEW_REQUIRED',
    },
    model_tier: 'T3',
  },
  {
    id: 'annual_cancel',
    name: 'Annual Subscription Cancel',
    input: 'Cancel my annual subscription',
    context: {
      subscription: { type: 'annual', status: 'active' },
    },
    expected_contains: ['pause', 'annual', 'cannot'],
    forbidden_contains: ['cancelled', 'done'],
    policy_check: {
      action: 'CANCEL_SUBSCRIPTION',
      expected: 'BLOCKED',
      reason: 'ANNUAL_CANCELLATION_BLOCKED',
    },
    model_tier: 'T2',
  },
];

export async function runEvalSuite(): Promise<{
  passed: number;
  failed: number;
  results: EvalResult[];
}> {
  const results: EvalResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of ECOM_EVAL_SUITE) {
    try {
      const response = await runTestCase(test);
      const checks: EvalResult['checks'] = [];

      // Check expected_contains
      if (test.expected_contains) {
        for (const phrase of test.expected_contains) {
          checks.push({
            type: 'contains',
            phrase,
            passed: response.content.toLowerCase().includes(phrase.toLowerCase()),
          });
        }
      }

      // Check forbidden_contains
      if (test.forbidden_contains) {
        for (const phrase of test.forbidden_contains) {
          checks.push({
            type: 'forbidden',
            phrase,
            passed: !response.content.toLowerCase().includes(phrase.toLowerCase()),
          });
        }
      }

      // Check policy
      if (test.policy_check) {
        checks.push({
          type: 'policy',
          passed: response.policy_decision?.reason === test.policy_check.reason,
        });
      }

      const allPassed = checks.every((c) => c.passed);
      if (allPassed) passed++;
      else failed++;

      results.push({
        test: test.id,
        name: test.name,
        passed: allPassed,
        checks,
      });
    } catch (error: any) {
      failed++;
      results.push({
        test: test.id,
        name: test.name,
        passed: false,
        checks: [],
        error: error.message,
      });
    }
  }

  return { passed, failed, results };
}

async function runTestCase(test: EvalCase): Promise<any> {
  // Run policy check first if applicable
  let policyDecision = null;
  if (test.policy_check) {
    policyDecision = await policyGuard.evaluate(test.policy_check.action, {
      order: test.context.order,
      user: test.context.user,
      subscription: test.context.subscription,
      clientPolicy: test.context.policy,
    });
  }

  // If policy blocks, return policy suggestion as content
  if (policyDecision && !policyDecision.allowed) {
    return {
      content: policyDecision.suggestion || 'Blocked by policy.',
      policy_decision: policyDecision,
    };
  }

  // Otherwise call LLM
  const llmResponse = await routeLLM({
    client_id: 'eval-test-client',
    user_id: 'eval-user',
    message: test.input,
    intent: test.id.split('_')[0],
    complexity: 0.5,
    sentiment: 0,
    context: {
      agentName: 'Zenny',
      brandName: 'Test Store',
      tone: 'friendly_professional',
    },
    history: [],
  });

  return {
    content: llmResponse.content,
    policy_decision: policyDecision,
  };
}
