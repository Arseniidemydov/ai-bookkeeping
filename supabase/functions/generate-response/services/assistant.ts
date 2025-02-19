
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ASSISTANT_ID = 'asst_abc123'; // Replace with your actual assistant ID

interface RunStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'requires_action';
}

export async function createThread(): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v1'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to create thread: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.id;
}

export async function addMessageToThread(threadId: string, content: string, fileUrl?: string): Promise<void> {
  const messageContent = fileUrl ? `${content}\nImage: ${fileUrl}` : content;

  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v1'
    },
    body: JSON.stringify({
      role: 'user',
      content: messageContent
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to add message: ${response.status} ${await response.text()}`);
  }
}

export async function getActiveRun(threadId: string): Promise<string | null> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get runs: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const activeRun = data.data.find((run: any) => 
    ['queued', 'in_progress', 'requires_action'].includes(run.status)
  );

  return activeRun ? activeRun.id : null;
}

export async function cancelRun(threadId: string, runId: string): Promise<void> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    }
  });

  if (!response.ok) {
    console.error(`Failed to cancel run: ${response.status} ${await response.text()}`);
  }
}

export async function startAssistantRun(threadId: string): Promise<{ id: string }> {
  // Check for active run first
  const activeRunId = await getActiveRun(threadId);
  if (activeRunId) {
    console.log(`Found active run ${activeRunId}, attempting to cancel...`);
    await cancelRun(threadId, activeRunId);
    // Add a small delay to ensure the cancellation is processed
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v1'
    },
    body: JSON.stringify({
      assistant_id: ASSISTANT_ID
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to start run: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return { id: data.id };
}

export async function getRunStatus(threadId: string, runId: string): Promise<RunStatus> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get run status: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return { status: data.status };
}

export async function getAssistantMessages(threadId: string): Promise<any> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get messages: ${response.status} ${await response.text()}`);
  }

  return response.json();
}
