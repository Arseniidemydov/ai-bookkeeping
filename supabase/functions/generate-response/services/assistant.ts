import { processImageWithOCR } from './ocr.ts';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

if (!openAIApiKey) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createThread() {
  const response = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to create thread: ${response.status} ${errorData}`);
  }

  const thread = await response.json();
  return thread.id;
}

async function getActiveRuns(threadId: string) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get runs: ${response.status} ${errorData}`);
  }

  const runs = await response.json();
  const activeRuns = runs.data.filter((run: any) => 
    ['queued', 'in_progress', 'requires_action'].includes(run.status)
  );
  
  console.log(`Found ${activeRuns.length} active runs:`, JSON.stringify(activeRuns));
  return activeRuns;
}

async function cancelRun(threadId: string, runId: string) {
  try {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (!response.ok) {
      console.error(`Failed to cancel run ${runId}:`, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error canceling run ${runId}:`, error);
    return false;
  }
}

async function waitForActiveRuns(threadId: string) {
  const maxAttempts = 30;
  const initialDelay = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const activeRuns = await getActiveRuns(threadId);
    
    if (activeRuns.length === 0) {
      return;
    }

    if (attempts > maxAttempts - 3) {
      console.log('Getting close to timeout, attempting to cancel active runs...');
      for (const run of activeRuns) {
        await cancelRun(threadId, run.id);
      }
    }
    
    const delay = initialDelay * Math.pow(1.2, attempts);
    console.log(`Thread has ${activeRuns.length} active runs. Waiting ${delay}ms... (Attempt ${attempts + 1}/${maxAttempts})`);
    await sleep(delay);
    attempts++;
  }

  throw new Error(`Timeout waiting for active runs to complete after ${maxAttempts} attempts`);
}

export async function addMessageToThread(threadId: string, content: string, fileUrl?: string) {
  try {
    await waitForActiveRuns(threadId);

    let messageContent = [];
    
    if (content.trim()) {
      messageContent.push({
        type: 'text',
        text: content
      });
    }
    
    if (fileUrl) {
      try {
        const extractedText = await processImageWithOCR(fileUrl);
        if (extractedText) {
          messageContent.push({
            type: 'text',
            text: `Extracted text from image:\n${extractedText}`
          });
        }
      } catch (error) {
        console.error('Error processing image:', error);
        const isImage = fileUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        if (isImage) {
          messageContent.push({
            type: 'image_url',
            image_url: {
              url: fileUrl
            }
          });
        }
      }
    }

    console.log('Sending message with content:', JSON.stringify(messageContent, null, 2));

    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: messageContent
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to add message: ${response.status} ${errorData}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error in addMessageToThread:', error);
    throw error;
  }
}

export async function startAssistantRun(threadId: string) {
  console.log('Starting assistant run for thread:', threadId);
  
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
      }

      const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        },
        body: JSON.stringify({
          assistant_id: 'asst_wn94DpzGVJKBFLR4wkh7btD2',
          model: 'gpt-4o',
          temperature: 0.7,
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
                    "source",
                    "date",
                    "category"
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
                    },
                    "date": {
                      "type": "string",
                      "description": "The date of the income in YYYY-MM-DD format."
                    },
                    "category": {
                      "type": "string",
                      "description": "Category of the income (e.g., passive, active, investments, etc.)."
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
                      "description": "Amount of the expense."
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
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to start run: ${response.status} ${errorData}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      lastError = error;
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw lastError;
}

export async function getRunStatus(threadId: string, runId: string) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Run status data:', errorData);
    throw new Error(`Failed to get run status: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  console.log('Run status data:', JSON.stringify(data, null, 2));
  return data;
}

export async function getAssistantMessages(threadId: string) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to get messages: ${response.status} ${errorData}`);
  }

  return await response.json();
}
