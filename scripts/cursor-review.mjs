#!/usr/bin/env node
import { Agent, Cursor } from '@cursor/sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const apiKey = required('CURSOR_API_KEY');
const apiUrl = required('INGESTION_API_URL').replace(/\/$/,'');
const sharedSecret = required('INGESTION_SHARED_SECRET');
const runId = required('INGESTION_RUN_ID');
const batchId = required('INGESTION_BATCH_ID');
const modelId = process.env.CURSOR_MODEL_ID || 'composer-2.5';

let workspace;
let agent;
try {
  const response = await fetch(`${apiUrl}/internal/review/batch?runId=${encodeURIComponent(runId)}`, { headers: { Authorization: `Bearer ${sharedSecret}` } });
  if (!response.ok) throw new Error(`Could not load review batch: ${response.status}`);
  const batch = await response.json();
  const models = await Cursor.models.list({ apiKey });
  if (!models.some(model => model.id === modelId || model.aliases?.includes(modelId))) throw new Error(`Cursor model ${modelId} is not available for this account`);
  workspace = await mkdtemp(join(tmpdir(),'bengaluru-live-cursor-'));
  const prompt = `You are the evidence reviewer for Bengaluru Live. Review ONLY the supplied candidate JSON. Do not browse, invent facts, write files, call production APIs, or make external changes. Return ONLY valid JSON with this exact shape: {"reviews":[{"candidateId":"...","decision":"publish|merge|reject|hold","fields":{},"uncertainty":[],"evidenceGaps":[],"reason":""}]}. Publish/merge only when the candidate has an identifiable title, ISO date, Bengaluru-metro venue, HTTPS sourceUrl, eventCategory, and evidence. Preserve missing values as empty/null. Use uncertainty for fields that are not supported by evidence.\n\nCANDIDATES:\n${JSON.stringify(batch.candidates)}`;
  agent = await Agent.create({ apiKey, model: { id: modelId }, tools: [], local: { cwd: workspace } });
  const run = await agent.send(prompt);
  const result = await run.wait();
  if (result.status !== 'finished' || !result.result) throw new Error(result.error?.message || 'Cursor review failed');
  const raw = result.result.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.reviews)) throw new Error('Cursor review response did not contain reviews');
  const callback = await fetch(`${apiUrl}/internal/review/callback`, { method:'POST', headers:{Authorization:`Bearer ${sharedSecret}`,'Content-Type':'application/json'}, body:JSON.stringify({runId,batchId,reviews:parsed.reviews}) });
  if (!callback.ok) throw new Error(`Could not apply review: ${callback.status}`);
  console.log(JSON.stringify({runId,batchId,model:modelId,reviewed:parsed.reviews.length}));
  await agent.close();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Cursor review failed';
  await fetch(`${apiUrl}/internal/review/callback`, { method:'POST', headers:{Authorization:`Bearer ${sharedSecret}`,'Content-Type':'application/json'}, body:JSON.stringify({runId,batchId,error:message}) }).catch(() => undefined);
  throw error;
} finally {
  if (agent) await agent.close().catch(() => undefined);
  if (workspace) await rm(workspace,{recursive:true,force:true});
}
