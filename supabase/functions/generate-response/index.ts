
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getTransactionsContext(supabase: any, userId: string) {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return transactions ? JSON.stringify(transactions) : '[]';
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
            "name": "add_expense",
            "description": "Add a new expense transaction",
            "parameters": {
              "type": "object",
              "properties": {
                "amount": {
                  "type": "number",
                  "description": "The amount of the expense"
                },
                "category": {
                  "type": "string",
                  "description": "The category of the expense"
                },
                "description": {
                  "type": "string",
                  "description": "Description of the expense"
                }
              },
              "required": ["amount", "category"]
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "add_income",
            "description": "Add a new income transaction",
            "parameters": {
              "type": "object",
              "properties": {
                "amount": {
                  "type": "number",
                  "description": "The amount of the income"
                },
                "source": {
                  "type": "string",
                  "description": "The source of the income"
                }
              },
              "required": ["amount", "source"]
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Received request:', { prompt, userId, threadId, fileUrl });
    
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const transactionsContext = await getTransactionsContext(supabase, userId);

    // Use existing thread or create new one
    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    try {
      await addMessageToThread(currentThreadId, prompt, fileUrl);
    } catch (error) {
      if (error.message.includes("while a run") && error.message.includes("is active")) {
        const runIdMatch = error.message.match(/run_([\w]+)/);
        if (runIdMatch && runIdMatch[1]) {
          const activeRunId = `run_${runIdMatch[1]}`;
          console.log('Detected active run:', activeRunId);
          
          const cancelled = await cancelActiveRun(currentThreadId, activeRunId);
          if (cancelled) {
            await addMessageToThread(currentThreadId, prompt, fileUrl);
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
    
    // Poll for completion with increased timeout and better logging
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 180; // Increased to 3 minutes
    const checkInterval = 1000; // Keep 1 second interval
    const startTime = Date.now();

    while (true) {
      const elapsedTime = (Date.now() - startTime) / 1000;
      console.log(`Run status check #${attempts + 1}. Status: ${runStatusData.status}. Elapsed time: ${elapsedTime.toFixed(1)}s`);
      
      if (runStatusData.status === 'completed') {
        console.log(`Run completed successfully after ${elapsedTime.toFixed(1)} seconds`);
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
      }
      
      // Wait before checking status again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      runStatusData = await getRunStatus(currentThreadId, run.id);
      attempts++;
    }

    // Get the final messages
    console.log('Fetching assistant messages...');
    const messages = await getAssistantMessages(currentThreadId);
    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant message found in response');
    }

    const generatedText = assistantMessage?.content[0]?.text?.value;
    if (!generatedText) {
      throw new Error('No valid response content found');
    }

    console.log('Successfully generated response');
    return new Response(JSON.stringify({ 
      generatedText,
      threadId: currentThreadId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
