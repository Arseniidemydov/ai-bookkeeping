
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!
});

// Use your specific assistant ID
const ASSISTANT_ID = "asst_wn94DpzGVJKBFLR4wkh7btD2";

export async function createThread() {
  const thread = await openai.beta.threads.create();
  return thread.id;
}

export async function addMessageToThread(threadId: string, content: string, fileUrl?: string) {
  let messageContent = content;
  if (fileUrl) {
    messageContent = `${content}\nImage URL: ${fileUrl}`;
  }
  
  await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: messageContent,
  });
}

export async function startAssistantRun(threadId: string) {
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: ASSISTANT_ID,
  });
  return run;
}

export async function getRunStatus(threadId: string, runId: string) {
  const run = await openai.beta.threads.runs.retrieve(threadId, runId);
  return run;
}

export async function getAssistantMessages(threadId: string) {
  const messages = await openai.beta.threads.messages.list(threadId);
  return messages;
}

export async function listRunsForThread(threadId: string) {
  const runs = await openai.beta.threads.runs.list(threadId);
  return runs;
}

export async function cancelRun(threadId: string, runId: string) {
  const run = await openai.beta.threads.runs.cancel(threadId, runId);
  return run;
}
