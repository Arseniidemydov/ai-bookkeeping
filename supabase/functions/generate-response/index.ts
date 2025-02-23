
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders, handleCORS } from './utils/cors.ts';
import { createThread, addMessageToThread, startAssistantRun, getRunStatus, getAssistantMessages } from './services/assistant.ts';
import { addExpenseTransaction, addIncomeTransaction, getTransactionsContext } from './services/transactions.ts';

serve(async (req) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Received request:', { prompt, userId, threadId, fileUrl });

    if (!userId) {
      throw new Error('User ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
      console.log('Created new thread:', currentThreadId);
    }

    console.log('Adding message to thread:', currentThreadId);
    await addMessageToThread(currentThreadId, prompt, fileUrl);

    const run = await startAssistantRun(currentThreadId);
    console.log('Started assistant run:', run.id);

    let runStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await getRunStatus(currentThreadId, run.id);
      console.log('Run status:', runStatus.status);

      if (runStatus.status === 'requires_action') {
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        console.log('Processing tool calls:', toolCalls);

        const toolOutputs = await Promise.all(toolCalls.map(async (toolCall: any) => {
          const { name, arguments: args } = toolCall.function;
          const parsedArgs = JSON.parse(args);
          console.log(`Executing function ${name} with args:`, parsedArgs);

          let output;
          try {
            switch (name) {
              case 'add_income':
                output = await addIncomeTransaction(
                  supabase,
                  parsedArgs.user_id,
                  parsedArgs.amount,
                  parsedArgs.source,
                  parsedArgs.date,
                  parsedArgs.category
                );
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
              case 'fetch_user_transactions':
                output = await getTransactionsContext(supabase, parsedArgs.user_id);
                break;
              default:
                throw new Error(`Unknown function: ${name}`);
            }
            return { tool_call_id: toolCall.id, output: JSON.stringify(output) };
          } catch (error) {
            console.error(`Error executing ${name}:`, error);
            throw error;
          }
        }));

        console.log('Submitting tool outputs:', toolOutputs);
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
    } while (!['completed', 'failed', 'expired'].includes(runStatus.status));

    if (runStatus.status !== 'completed') {
      throw new Error(`Run failed with status: ${runStatus.status}`);
    }

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
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
