import { processImageWithOCR } from './ocr.ts';
import { getTransactionsContext, addIncomeTransaction, addExpenseTransaction, getPDFImages } from './../services/transactions.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

export async function cancelActiveRun(threadId: string, runId: string) {
  console.log('Attempting to cancel run:', runId, 'for thread:', threadId);
  try {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Failed to cancel run:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error canceling run:', error);
    return false;
  }
}

export async function addMessageToThread(threadId: string, content: string, fileUrl?: string) {
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
}

export async function startAssistantRun(threadId: string) {
  console.log('Starting assistant run for thread:', threadId);
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
                "category"
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
