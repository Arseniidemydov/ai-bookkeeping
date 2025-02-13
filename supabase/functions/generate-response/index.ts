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

async function addMessageToThread(threadId: string, content: string, fileUrl?: string) {
  let messageContent = [];
  
  // Add text content if provided
  if (content.trim()) {
    messageContent.push({
      type: 'text',
      text: content
    });
  }
  
  // Add image content if URL is provided
  if (fileUrl) {
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

async function startAssistantRun(threadId: string) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      assistant_id: 'asst_wn94DpzGVJKBFLR4wkh7btD2',
      model: 'gpt-4o', // Using gpt-4o which supports vision
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

async function getRunStatus(threadId: string, runId: string) {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });
  return await response.json();
}

async function handleToolCalls(toolCalls: any[], userId: string, supabase: any) {
  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    console.log('Processing tool call:', toolCall);

    try {
      if (toolCall.function.name === 'add_expense') {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log('Adding expense:', functionArgs);

        const { error: insertError } = await supabase
          .from('transactions')
          .insert([{
            user_id: userId,
            amount: functionArgs.amount,
            category: functionArgs.category,
            description: functionArgs.description,
            type: 'expense',
            date: new Date().toISOString()
          }]);

        if (insertError) throw insertError;

        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ success: true })
        });
      } else if (toolCall.function.name === 'add_income') {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        console.log('Adding income:', functionArgs);

        const { error: insertError } = await supabase
          .from('transactions')
          .insert([{
            user_id: userId,
            amount: functionArgs.amount,
            category: functionArgs.source,
            type: 'income',
            date: new Date().toISOString()
          }]);

        if (insertError) throw insertError;

        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ success: true })
        });
      } else {
        console.log('Unhandled tool call:', toolCall.function.name);
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ success: true })
        });
      }
    } catch (error) {
      console.error('Error handling tool call:', error);
      toolOutputs.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify({ success: false, error: error.message })
      });
    }
  }

  return toolOutputs;
}

async function submitToolOutputs(threadId: string, runId: string, toolOutputs: any[]) {
  console.log('Submitting tool outputs:', toolOutputs);
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({ tool_outputs: toolOutputs })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Tool outputs submission error:', errorData);
    throw new Error(`Failed to submit tool outputs: ${response.status} ${errorData}`);
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
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Received request:', { prompt, userId, threadId, fileUrl });
    
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const transactionsContext = await getTransactionsContext(supabase, userId);

    // Use existing thread or create new one
    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    // Add message to thread with proper handling of file URLs
    await addMessageToThread(currentThreadId, prompt, fileUrl);

    // Start the assistant run
    const run = await startAssistantRun(currentThreadId);
    
    // Poll for completion
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 60;
    const checkInterval = 1000;

    while (true) {
      console.log('Current run status:', runStatusData.status);
      
      if (runStatusData.status === 'completed') {
        break;
      }
      
      if (runStatusData.status === 'failed' || runStatusData.status === 'expired' || runStatusData.status === 'cancelled') {
        throw new Error(`Run failed with status: ${runStatusData.status}`);
      }
      
      if (runStatusData.status === 'requires_action') {
        console.log('Run requires action:', runStatusData.required_action);
        const toolCalls = runStatusData.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = await handleToolCalls(toolCalls, userId, supabase);
        
        // Submit tool outputs
        console.log('Submitting tool outputs');
        await submitToolOutputs(currentThreadId, run.id, toolOutputs);
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Assistant run timed out');
      }

      // Wait before checking status again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      runStatusData = await getRunStatus(currentThreadId, run.id);
      attempts++;
    }

    // Get the final messages
    const messages = await getAssistantMessages(currentThreadId);
    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant message found in response');
    }

    const generatedText = assistantMessage?.content[0]?.text?.value;
    if (!generatedText) {
      throw new Error('No valid response content found');
    }

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
