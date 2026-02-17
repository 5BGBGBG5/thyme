import { supabase } from './supabase';

/**
 * Emit a signal to the shared agent signal bus.
 * Fails silently if the shared_agent_signals table does not exist yet.
 */
export async function emitSignal(eventType: string, payload: Record<string, unknown>) {
  try {
    await supabase.from('shared_agent_signals').insert({
      source_agent: 'thyme',
      event_type: eventType,
      payload,
    });
  } catch {
    // Table may not exist yet — fail silently
  }
}
