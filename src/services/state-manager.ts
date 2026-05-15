import { SessionState } from '../types';
import {
  getSession as redisGetSession,
  saveSession as redisSaveSession,
  findCrossChannelSession,
  deleteSession,
  setAsyncAction,
  getAsyncAction,
  clearAsyncAction,
} from './redis';

export class StateManager {
  async getSession(clientId: string, userId: string, channel: string): Promise<SessionState> {
    // 1. Check active Redis session
    let session = await redisGetSession(clientId, userId);

    // 2. If none, check cross-channel merge
    if (!session) {
      const merged = await findCrossChannelSession(clientId, {});
      if (merged) {
        session = merged;
        // Update channel to current
        session.channel = channel;
      }
    }

    // 3. If still none, initialize new session
    if (!session) {
      session = {
        client_id: clientId,
        user_id: userId,
        channel: channel,
        slots: {},
        intent_history: [],
        turn_count: 0,
        created_at: Date.now(),
        last_activity: Date.now(),
        transcript: [],
      };
    }

    return session as SessionState;
  }

  async updateSlots(session: SessionState, extractedSlots: Record<string, any>): Promise<void> {
    session.slots = { ...session.slots, ...extractedSlots };
    session.last_activity = Date.now();
    await redisSaveSession(session.client_id, session.user_id, session, 3600);
  }

  async addIntent(session: SessionState, intent: string): Promise<void> {
    session.intent_history.push(intent);
    if (session.intent_history.length > 20) {
      session.intent_history = session.intent_history.slice(-20);
    }
    session.last_activity = Date.now();
    await redisSaveSession(session.client_id, session.user_id, session, 3600);
  }

  async incrementTurn(session: SessionState): Promise<void> {
    session.turn_count += 1;
    session.last_activity = Date.now();
    await redisSaveSession(session.client_id, session.user_id, session, 3600);
  }

  async addTranscriptMessage(
    session: SessionState,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!session.transcript) session.transcript = [];
    session.transcript.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    });
    session.last_activity = Date.now();
    await redisSaveSession(session.client_id, session.user_id, session, 3600);
  }

  async handleAsyncAction(session: SessionState, actionPromise: Promise<any>): Promise<void> {
    // Store pending action reference
    await setAsyncAction(`${session.client_id}:${session.user_id}`, {
      action: 'pending',
      started_at: Date.now(),
    });
  }

  async checkAsyncAction(session: SessionState): Promise<any | null> {
    return await getAsyncAction(`${session.client_id}:${session.user_id}`);
  }

  async clearAsyncActionState(session: SessionState): Promise<void> {
    await clearAsyncAction(`${session.client_id}:${session.user_id}`);
  }

  async destroySession(clientId: string, userId: string): Promise<void> {
    await deleteSession(clientId, userId);
  }
}

export const stateManager = new StateManager();
