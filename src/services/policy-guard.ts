import { PolicyDecision } from '../types';

interface PolicyContext {
  order?: {
    id: string;
    fraud_score: number;
    age_days: number;
    total: number;
    status?: string;
  };
  user?: {
    verified: boolean;
    vip?: boolean;
    email?: string;
  };
  subscription?: {
    type: string;
    status?: string;
  };
  clientPolicy?: {
    max_return_days: number;
    refund_threshold?: number;
    require_verification_above?: number;
  };
}

export class PolicyGuard {
  async evaluate(actionType: string, context: PolicyContext): Promise<PolicyDecision> {
    switch (actionType) {
      case 'REFUND':
        return this.evaluateRefund(context);
      case 'CANCEL_SUBSCRIPTION':
        return this.evaluateCancellation(context);
      case 'HUMAN_HANDOFF':
        return this.evaluateEscalation(context);
      case 'SHARE_ORDER_DETAILS':
        return this.evaluateDataSharing(context);
      case 'GENERATE_RETURN_LABEL':
        return this.evaluateReturnLabel(context);
      default:
        return { allowed: true };
    }
  }

  private evaluateRefund(ctx: PolicyContext): PolicyDecision {
    const { order, user, clientPolicy } = ctx;

    if (!order || !clientPolicy) {
      return { allowed: false, reason: 'MISSING_CONTEXT', escalate: true };
    }

    // Fraud check — highest priority
    if (order.fraud_score > 0.8) {
      return {
        allowed: false,
        reason: 'FRAUD_REVIEW',
        escalate: true,
        priority: 'high',
        suggestion: 'This order has been flagged for review. Our team will contact you within 24 hours.',
      };
    }

    // Return window expired
    if (order.age_days > clientPolicy.max_return_days) {
      return {
        allowed: false,
        reason: 'POLICY_EXPIRED',
        suggestion: `Our return window is ${clientPolicy.max_return_days} days. This order is outside that window.`,
      };
    }

    // High-value unverified order
    const verificationThreshold = clientPolicy.require_verification_above || 500;
    if (order.total > verificationThreshold && !user?.verified) {
      return {
        allowed: false,
        reason: 'MANUAL_REVIEW_REQUIRED',
        escalate: true,
        priority: 'medium',
        suggestion: 'For your security, orders over $' + verificationThreshold + ' require additional verification. Our team will assist you.',
      };
    }

    return { allowed: true };
  }

  private evaluateCancellation(ctx: PolicyContext): PolicyDecision {
    const { subscription } = ctx;

    if (subscription?.type === 'annual') {
      return {
        allowed: false,
        reason: 'ANNUAL_CANCELLATION_BLOCKED',
        suggestion: 'Annual subscriptions can be paused but not cancelled mid-term. Would you like to pause instead?',
      };
    }

    return { allowed: true };
  }

  private evaluateEscalation(ctx: PolicyContext): PolicyDecision {
    const { user } = ctx;

    if (user?.vip) {
      return { allowed: true, priority: 'high' };
    }

    return { allowed: true, priority: 'medium' };
  }

  private evaluateDataSharing(ctx: PolicyContext): PolicyDecision {
    const { user, order } = ctx;

    if (order && order.total > 200 && !user?.verified) {
      return {
        allowed: false,
        reason: 'VERIFICATION_REQUIRED',
        suggestion: 'Please verify your email to view order details.',
      };
    }

    return { allowed: true };
  }

  private evaluateReturnLabel(ctx: PolicyContext): PolicyDecision {
    const { order, clientPolicy } = ctx;

    if (!order || !clientPolicy) {
      return { allowed: false, reason: 'MISSING_CONTEXT', escalate: false };
    }

    if (order.age_days > clientPolicy.max_return_days) {
      return {
        allowed: false,
        reason: 'POLICY_EXPIRED',
        suggestion: `Return window expired. Our policy allows ${clientPolicy.max_return_days} days.`,
      };
    }

    if (order.fraud_score > 0.8) {
      return {
        allowed: false,
        reason: 'FRAUD_REVIEW',
        escalate: true,
        priority: 'high',
      };
    }

    return { allowed: true };
  }
}

export const policyGuard = new PolicyGuard();
