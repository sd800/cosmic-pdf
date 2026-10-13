import { AI_PROVIDERS, AI_LIMITS } from '../../core/ai.js';
export function providerRequest(provider, key, system, messages) {
  const config = AI_PROVIDERS[provider]; if (!config) throw Error('invalidRequest');
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  let body;
  if (provider === 'openai') {
    headers.Authorization = 'Bearer ' + key;
    body = { model: config.id, instructions: system, input: messages, stream: true, store: false, max_output_tokens: 2048, reasoning: { effort: 'none' } };
  } else if (provider === 'gemini') {
    headers['x-goog-api-key'] = key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } };
  } else {
    headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = { model: config.id, system, messages, stream: true, max_tokens: 2048, thinking: { type: 'disabled' } };
  }
  return { url: config.endpoint, init: { method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit',
    redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' } };
}
export async function streamExplanation(provider, key, prompt, { signal, onText, fetcher = fetch }) {
  const request = providerRequest(provider, key, prompt.system, prompt.messages);
  signal.throwIfAborted();
  const response = await fetcher(request.url, { ...request.init, signal });
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw Error([401,403].includes(response.status) ? 'auth' : response.status === 429 ? 'quota' : 'unavailable'); }
  if (!response.body || !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type')||'')) { await response.body?.cancel().catch(() => {}); throw Error('unavailable'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', bytes = 0, completed = false;
  function event(raw) {
    if (raw.length > AI_LIMITS.event) throw Error('limit');
    const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let item; try { item = JSON.parse(data); } catch { throw Error('unavailable'); }
    if (item.error || ['error','response.failed'].includes(item.type)) throw Error('unavailable');
    let delta = '';
    if (provider === 'openai') {
      if (item.type === 'response.output_text.delta') delta = item.delta || '';
      if (item.type === 'response.refusal.delta') throw Error('blocked');
      if (item.type === 'response.completed') completed = true;
      if (item.type === 'response.incomplete') throw Error('limit');
    } else if (provider === 'claude') {
      if (item.type === 'content_block_start' && item.content_block?.type === 'text') delta = item.content_block.text || '';
      if (item.type === 'content_block_delta' && item.delta?.type === 'text_delta') delta = item.delta.text || '';
      if (item.type === 'message_delta' && item.delta?.stop_reason === 'max_tokens') throw Error('limit');
      if (item.type === 'message_stop') completed = true;
    } else {
      if (item.promptFeedback?.blockReason) throw Error('blocked');
      const candidate = item.candidates?.[0];
      delta = (candidate?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
      if (candidate?.finishReason) {
        if (candidate.finishReason !== 'STOP') throw Error(candidate.finishReason === 'MAX_TOKENS' ? 'limit' : 'blocked');
        completed = true;
      }
    }
    if (typeof delta !== 'string') throw Error('unavailable');
    if (delta) { text += delta; if (text.length > AI_LIMITS.output) throw Error('limit'); onText(delta); }
  }
  try {
    while (true) {
      signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > AI_LIMITS.stream) throw Error('limit');
      buffer += decoder.decode(chunk.value, { stream: true });
      // Normalize CRLF only after a complete line arrives (chunks can split CR/LF).
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary; while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(raw);
      }
      if (buffer.length > AI_LIMITS.event) throw Error('limit');
    }
    buffer += decoder.decode(); if (buffer.trim()) event(buffer);
    signal.throwIfAborted();
    if (!completed) throw Error('unavailable');
    if (!text.trim()) throw Error('empty');
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
