import { supabase } from './db';
import { config } from '../config';
import { KBChunk } from '../types';

export async function queryKB(
  clientId: string,
  query: string,
  topK = 3,
  threshold = 0.75
): Promise<KBChunk[]> {
  const embedding = await embedText(query);

  const { data, error } = await supabase.rpc('match_kb_chunks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topK,
    p_client_id: clientId,
  });

  if (error) {
    console.error('KB query error:', error);
    return [];
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    content: item.content,
    similarity: item.similarity,
    source_url: item.source_url,
    metadata: item.metadata,
  }));
}

export async function embedText(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${config.llm.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/embedding-001',
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding?.values || [];
}

export async function ingestDocument(
  clientId: string,
  content: string,
  sourceUrl: string,
  sourceType: string,
  metadata?: Record<string, any>
): Promise<void> {
  const chunks = chunkText(content, 400);

  for (const chunk of chunks) {
    const embedding = await embedText(chunk);

    const { error } = await supabase.from('kb_chunks').insert({
      client_id: clientId,
      content: chunk,
      embedding,
      source_url: sourceUrl,
      source_type: sourceType,
      metadata: metadata || {},
      last_updated: new Date().toISOString(),
    });

    if (error) {
      console.error('KB chunk insert error:', error);
    }
  }
}

export async function deleteKBChunksBySource(clientId: string, sourceUrl: string): Promise<void> {
  const { error } = await supabase
    .from('kb_chunks')
    .delete()
    .eq('client_id', clientId)
    .eq('source_url', sourceUrl);

  if (error) {
    console.error('KB delete error:', error);
  }
}

function chunkText(text: string, maxLength: number): string[] {
  // Split by sentences, then group into chunks
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength * 4) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current += ' ' + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
