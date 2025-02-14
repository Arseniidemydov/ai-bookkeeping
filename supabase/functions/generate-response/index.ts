import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function handleCORS(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  return null;
}

async function getTransactionsContext(supabase: any, userId: string) {
  if (!userId) {
    console.log('No user ID provided for transactions context');
    return '[]';
  }

  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId);

    const { data: transactions, error } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    const sortedTransactions = transactions?.sort((a: any, b: any) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }) || [];

    console.log('Successfully fetched transactions for user:', userId, 'count:', sortedTransactions.length);
    return JSON.stringify(sortedTransactions);
  } catch (error) {
    console.error('Error in getTransactionsContext:', error);
    return '[]';
  }
}

async function addIncomeTransaction(supabase: any, userId: string, amount: number, source: string) {
  if (!userId) {
    throw new Error('User ID is required for adding income transaction');
  }

  try {
    const date = new Date().toISOString();
    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        amount: amount,
        type: 'income',
        description: source,
        category: source,
        date: date
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding income transaction:', error);
      throw error;
    }

    console.log('Successfully added income transaction:', data);
    return JSON.stringify(data);
  } catch (error) {
    console.error('Error in addIncomeTransaction:', error);
    throw error;
  }
}

async function addExpenseTransaction(supabase: any, userId: string, amount: number, category: string) {
  if (!userId) {
    throw new Error('User ID is required for adding expense transaction');
  }

  try {
    const date = new Date().toISOString();
    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        amount: -Math.abs(amount), // Make sure expense amount is negative
        type: 'expense',
        description: category,
        category: category,
        date: date
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding expense transaction:', error);
      throw error;
    }

    console.log('Successfully added expense transaction:', data);
    return JSON.stringify(data);
  } catch (error) {
    console.error('Error in addExpenseTransaction:', error);
    throw error;
  }
}

async function createThread() {
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

async function processImageWithOCR(fileUrl: string) {
  console.log('Processing image with OCR:', fileUrl);
  const response = await fetch(`${supabaseUrl}/functions/v1/process-image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl: fileUrl })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to process image: ${error}`);
  }

  const { text } = await response.json();
  return text;
}

async function cancelActiveRun(threadId: string, runId: string) {
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

async function addMessageToThread(threadId: string, content: string, fileUrl?: string) {
  let messageContent = [];
  
  // Add text content if provided
  if (content.trim()) {
    messageContent.push({
      type: 'text',
      text: content
    });
  }
  
  // Process file if URL is provided
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
      // Still include the image URL for OpenAI's vision model as backup
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

async function getRunStatus(threadId: string, runId: string) {
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

async function handleRequiredAction(threadId: string, runId: string, requiredAction: any) {
  console.log('Handling required action:', JSON.stringify(requiredAction, null, 2));
  
  const toolCalls = requiredAction.submit_tool_outputs.tool_calls;
  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments);
    
    let output;
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    console.log('Processing function call:', functionName, 'with args:', functionArgs);

    try {
      switch (functionName) {
        case 'fetch_user_transactions':
          if (!functionArgs.user_id) {
            throw new Error('User ID is required for fetching transactions');
          }
          output = await getTransactionsContext(supabase, functionArgs.user_id);
          break;
        case 'add_income':
          if (!functionArgs.user_id) {
            throw new Error('User ID is required for adding income');
          }
          output = await addIncomeTransaction(
            supabase,
            functionArgs.user_id,
            functionArgs.amount,
            functionArgs.source
          );
          break;
        case 'add_expense':
          if (!functionArgs.user_id) {
            throw new Error('User ID is required for adding expense');
          }
          console.log('Handling add_expense with args:', functionArgs);
          output = await addExpenseTransaction(
            supabase,
            functionArgs.user_id,
            functionArgs.amount,
            functionArgs.category
          );
          break;
        case 'get_pdf_images':
          if (!functionArgs.document_id) {
            throw new Error('Document ID is required for fetching PDF images');
          }
          output = await getPDFImages(supabase, functionArgs.document_id);
          break;
        default:
          console.error('Unknown function called:', functionName);
          throw new Error(`Function ${functionName} not implemented`);
      }

      toolOutputs.push({
        tool_call_id: toolCall.id,
        output: output
      });
    } catch (error) {
      console.error(`Error processing ${functionName}:`, error);
      throw error;
    }
  }

  const submitResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({ tool_outputs: toolOutputs })
  });

  if (!submitResponse.ok) {
    const errorData = await submitResponse.text();
    throw new Error(`Failed to submit tool outputs: ${submitResponse.status} ${errorData}`);
  }

  return await submitResponse.json();
}

async function startAssistantRun(threadId: string) {
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
      model: 'gpt-4o-mini',
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

async function getAssistantMessages(threadId: string) {
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

async function getPDFImages(supabase: any, documentId: string) {
  if (!documentId) {
    throw new Error('Document ID is required for fetching PDF images');
  }

  try {
    const { data: pages, error } = await supabase
      .from('document_pages')
      .select('*')
      .eq('document_id', documentId)
      .order('page_number');

    if (error) {
      console.error('Error fetching PDF pages:', error);
      throw error;
    }

    console.log('Successfully fetched PDF pages:', pages);
    return JSON.stringify(pages);
  } catch (error) {
    console.error('Error in getPDFImages:', error);
    throw error;
  }
}

serve(async (req) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Received request:', { prompt, userId, threadId, fileUrl });
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        error: "User ID is required to process this request" 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const transactionsContext = await getTransactionsContext(supabase, userId);

    // Use existing thread or create new one
    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    // Add transaction context to the user's message
    const messageWithContext = `User's transactions context: ${transactionsContext}\n\nUser's message: ${prompt}`;
    
    try {
      await addMessageToThread(currentThreadId, messageWithContext, fileUrl);
    } catch (error) {
      if (error.message.includes("while a run") && error.message.includes("is active")) {
        const runIdMatch = error.message.match(/run_([\w]+)/);
        if (runIdMatch && runIdMatch[1]) {
          const activeRunId = `run_${runIdMatch[1]}`;
          console.log('Detected active run:', activeRunId);
          
          const cancelled = await cancelActiveRun(currentThreadId, activeRunId);
          if (cancelled) {
            await addMessageToThread(currentThreadId, messageWithContext, fileUrl);
          } else {
            throw new Error('Failed to cancel active run and retry message');
          }
        }
      } else {
        throw error;
      }
    }

    // Start the assistant run
    console.log('Starting assistant run...');
    const run = await startAssistantRun(currentThreadId);
    console.log('Run started with ID:', run.id);
    
    // Wait for run completion with improved status handling
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 150; // Increased max attempts
    const checkInterval = 1000; // Increased interval to 1 second
    const startTime = Date.now();

    while (true) {
      const elapsedTime = (Date.now() - startTime) / 1000;
      console.log(`Run status check #${attempts + 1}. Status: ${runStatusData.status}. Elapsed time: ${elapsedTime.toFixed(1)}s`);
      
      if (runStatusData.status === 'completed') {
        console.log(`Run completed successfully after ${elapsedTime.toFixed(1)} seconds`);
        
        // Add delay after completion before fetching messages
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
      }
      
      if (runStatusData.status === 'failed' || runStatusData.status === 'expired' || runStatusData.status === 'cancelled') {
        console.error('Run failed with details:', JSON.stringify(runStatusData, null, 2));
        throw new Error(`Run failed with status: ${runStatusData.status}. Last error: ${runStatusData.last_error?.message || 'Unknown error'}`);
      }
      
      if (attempts >= maxAttempts) {
        console.error(`Run timed out after ${maxAttempts} attempts (${elapsedTime.toFixed(1)} seconds)`);
        throw new Error('Assistant run timed out');
      }
      
      if (runStatusData.status === 'requires_action') {
        console.log('Run requires action:', JSON.stringify(runStatusData.required_action, null, 2));
        await handleRequiredAction(currentThreadId, run.id, runStatusData.required_action);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      runStatusData = await getRunStatus(currentThreadId, run.id);
      attempts++;
    }

    console.log('Fetching assistant messages...');
    const messages = await getAssistantMessages(currentThreadId);
    console.log('Retrieved messages:', JSON.stringify(messages.data, null, 2));
    
    const assistantMessage = messages.data.find((msg: any) => 
      msg.role === 'assistant' && msg.content && msg.content.length > 0
    );
    
    if (!assistantMessage) {
      console.error('No valid assistant message found in response. Messages:', JSON.stringify(messages.data, null, 2));
      throw new Error('No assistant message found in response');
    }

    const generatedText = assistantMessage.content[0]?.text?.value;
    if (!generatedText) {
      console.error('No text content found in message:', JSON.stringify(assistantMessage, null, 2));
      throw new Error('No valid response content found');
    }

    console.log('Successfully generated response');
    return new Response(JSON.stringify({ 
      generatedText,
      threadId: currentThreadId
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json'
      },
    });
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json'
      },
    });
  }
});
