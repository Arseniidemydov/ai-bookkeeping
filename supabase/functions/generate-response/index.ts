
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders, handleCORS } from './utils/cors.ts';
import {
  createThread,
  addMessageToThread,
  startAssistantRun,
  getRunStatus,
  getAssistantMessages,
  cancelActiveRun
} from './services/assistant.ts';
import { addExpenseTransaction, addIncomeTransaction, getTransactionsContext } from './services/transactions.ts';

const POLLING_INTERVAL = 300; // 300ms between checks
const MAX_POLLING_ATTEMPTS = 10; // 3 seconds total (10 * 300ms)

serve(async (req) => {
  try {
    // Handle CORS
    const corsResponse = handleCORS(req);
    if (corsResponse) return corsResponse;

    const { prompt, userId, threadId, fileUrl } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get or create thread
    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
      console.log('Created new thread:', currentThreadId);
    }

    // Add message to thread
    await addMessageToThread(currentThreadId, prompt, fileUrl);

    // Start the run
    const run = await startAssistantRun(currentThreadId);
    console.log('Started run:', run.id);

    // Poll for completion with timeout
    let attempts = 0;
    let runStatus;
    
    while (attempts < MAX_POLLING_ATTEMPTS) {
      runStatus = await getRunStatus(currentThreadId, run.id);
      console.log(`Run status (attempt ${attempts + 1}/${MAX_POLLING_ATTEMPTS}):`, runStatus.status);

      if (runStatus.status === 'completed') {
        break;
      }

      if (['failed', 'cancelled', 'expired'].includes(runStatus.status)) {
        // Immediately throw error for failed states
        throw new Error(`Run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
      }

      if (runStatus.status === 'requires_action') {
        console.log('Function calling:', runStatus.required_action);
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        
        // Process all tool calls in parallel
        const toolOutputs = await Promise.all(toolCalls.map(async (toolCall: any) => {
          const { name, arguments: args } = toolCall.function;
          const parsedArgs = JSON.parse(args);
          let output;

          console.log(`Executing function ${name} with args:`, parsedArgs);

          try {
            switch (name) {
              case 'fetch_user_transactions':
                output = await getTransactionsContext(supabase, parsedArgs.user_id);
                break;
              case 'add_expense':
                output = await addExpenseTransaction(
                  supabase,
                  parsedArgs.user_id,
                  parsedArgs.amount,
                  parsedArgs.category,
                  parsedArgs.date
                );
                break;
              case 'add_income':
                output = await addIncomeTransaction(
                  supabase,
                  parsedArgs.user_id,
                  parsedArgs.amount,
                  parsedArgs.source
                );
                break;
              default:
                throw new Error(`Unknown function: ${name}`);
            }
            return { tool_call_id: toolCall.id, output };
          } catch (error) {
            console.error(`Error executing ${name}:`, error);
            throw error; // Let the error bubble up immediately
          }
        }));

        // Submit tool outputs
        const submitResponse = await fetch(
          `https://api.openai.com/v1/threads/${currentThreadId}/runs/${run.id}/submit_tool_outputs`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
              'Content-Type': 'application/json',
              'OpenAI-Beta': 'assistants=v2'
            },
            body: JSON.stringify({ tool_outputs: toolOutputs })
          }
        );

        if (!submitResponse.ok) {
          throw new Error(`Failed to submit tool outputs: ${await submitResponse.text()}`);
        }
      }

      // Short wait before next check
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      attempts++;
    }

    if (attempts >= MAX_POLLING_ATTEMPTS) {
      await cancelActiveRun(currentThreadId, run.id);
      throw new Error('Response timeout - Assistant is taking too long to respond');
    }

    // Get the latest messages
    const messages = await getAssistantMessages(currentThreadId);
    const assistantMessage = messages.data.find((msg: any) => 
      msg.role === 'assistant' && 
      msg.content?.[0]?.text?.value &&
      msg.created_at > run.created_at
    );

    if (!assistantMessage?.content[0]?.text?.value) {
      throw new Error('No valid response content found');
    }

    return new Response(
      JSON.stringify({
        generatedText: assistantMessage.content[0].text.value,
        threadId: currentThreadId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-response:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        details: error.stack
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
