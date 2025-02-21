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
  console.log('Starting assistant run for thread:', threadId);
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      assistant_id: 'asst_wn94DpzGVJKBFLR4wkh7btD2',
      model: 'gpt-4-1106-preview',
      tools: [
        {
          "type": "function",
          "function": {
            "name": "fetch_user_transactions",
            "description": "Retrieves all financial transactions for a specific user from the Supabase database.",
            "parameters": {
              "type": "object",
              "required": ["user_id"],
              "properties": {
                "user_id": {
                  "type": "string",
                  "description": "The unique identifier of the user whose transactions should be retrieved."
                },
                "start_date": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Optional start date for filtering transactions (ISO 8601 format)."
                },
                "end_date": {
                  "type": "string",
                  "format": "date-time",
                  "description": "Optional end date for filtering transactions (ISO 8601 format)."
                },
                "category": {
                  "type": "string",
                  "description": "Optional category to filter transactions."
                }
              }
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "add_income",
            "description": "Add an income to the user's account",
            "parameters": {
              "type": "object",
              "required": [
                "user_id",
                "amount",
                "source"
              ],
              "properties": {
                "user_id": {
                  "type": "string",
                  "description": "Unique identifier for the user."
                },
                "amount": {
                  "type": "number",
                  "description": "Amount of the income."
                },
                "source": {
                  "type": "string",
                  "description": "Source of the income (e.g., salary, freelance, etc.)."
                }
              }
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "add_expense",
            "description": "Add an expense to the user's account",
            "parameters": {
              "type": "object",
              "required": [
                "user_id",
                "amount",
                "category",
                "date"
              ],
              "properties": {
                "user_id": {
                  "type": "string",
                  "description": "Unique identifier for the user."
                },
                "amount": {
                  "type": "number",
                  "description": "Amount of the expense (positive number)."
                },
                "category": {
                  "type": "string",
                  "description": "Category of the expense (e.g., food, transport, etc.)."
                },
                "date": {
                  "type": "string",
                  "description": "The date of the expense in DD-MM-YYYY format."
                }
              }
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "get_pdf_images",
            "description": "Retrieve the images generated from a PDF document",
            "parameters": {
              "type": "object",
              "required": ["document_id"],
              "properties": {
                "document_id": {
                  "type": "string",
                  "description": "The unique identifier of the PDF document"
                }
              }
            }
          }
        }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to start run: ${response.status} ${errorData}`);
  }

  return await response.json();
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
