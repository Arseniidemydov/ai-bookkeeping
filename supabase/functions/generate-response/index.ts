
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from './utils/cors.ts';
import { getTransactionsContext, addIncomeTransaction, addExpenseTransaction } from './services/transactions.ts';
import { 
  createThread, 
  addMessageToThread, 
  startAssistantRun, 
  getRunStatus, 
  getAssistantMessages 
} from './services/assistant.ts';
import { getPDFImages } from './services/ocr.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

if (!openAIApiKey) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const transactionsContext = await getTransactionsContext(supabase, userId);

    let currentThreadId = threadId;
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    const messageWithContext = transactionsContext ? 
      `Context: ${transactionsContext}\nUser: ${prompt}` : 
      `User: ${prompt}`;

    await addMessageToThread(currentThreadId, messageWithContext, fileUrl);

    console.log('Starting assistant run...');
    const run = await startAssistantRun(currentThreadId);
    console.log('Run started with ID:', run.id);
    
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 10; // Increased max attempts
    const initialDelay = 3000; // Increased initial delay
    const maxDelay = 60000; // Maximum delay of 60 seconds

    while (attempts < maxAttempts) {
      console.log(`Run status check #${attempts + 1}. Status: ${runStatusData.status}`);
      
      if (runStatusData.status === 'completed') {
        const messages = await getAssistantMessages(currentThreadId);
        const assistantMessage = messages.data.find((msg: any) => 
          msg.role === 'assistant' && msg.content && msg.content.length > 0
        );

        if (!assistantMessage?.content[0]?.text?.value) {
          throw new Error('No valid response content found');
        }

        return new Response(JSON.stringify({ 
          generatedText: assistantMessage.content[0].text.value,
          threadId: currentThreadId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (['failed', 'expired', 'cancelled'].includes(runStatusData.status)) {
        if (runStatusData.last_error?.code === 'rate_limit_exceeded') {
          const retryAfter = parseFloat(runStatusData.last_error.message.match(/try again in (\d+\.?\d*)s/)?.[1] || "3");
          const delay = Math.min(Math.max(retryAfter * 1000, initialDelay), maxDelay);
          
          console.log(`Rate limit hit. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          console.log('Restarting assistant run...');
          const newRun = await startAssistantRun(currentThreadId);
          runStatusData = await getRunStatus(currentThreadId, newRun.id);
          attempts++;
          continue;
        }

        const error = `Run failed with status: ${runStatusData.status}. Last status data: ${JSON.stringify(runStatusData)}`;
        console.error(error);
        throw new Error(error);
      }
      
      if (runStatusData.status === 'requires_action') {
        const toolOutputs = await handleRequiredAction(currentThreadId, run.id, runStatusData.required_action, supabase);
        console.log('Tool outputs submitted:', JSON.stringify(toolOutputs));
      }
      
      // Calculate exponential backoff delay with jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempts) * (0.5 + Math.random() * 0.5), 
        maxDelay
      );
      
      console.log(`Waiting ${delay}ms before next status check...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      runStatusData = await getRunStatus(currentThreadId, run.id);
      attempts++;
    }

    throw new Error('Assistant run timed out after maximum retries');
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleRequiredAction(threadId: string, runId: string, requiredAction: any, supabase: any) {
  console.log('Handling required action:', JSON.stringify(requiredAction, null, 2));
  
  const toolCalls = requiredAction.submit_tool_outputs.tool_calls;
  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments);
    
    console.log('Processing function call:', functionName, 'with args:', functionArgs);

    try {
      let output;
      switch (functionName) {
        case 'fetch_user_transactions':
          output = await getTransactionsContext(supabase, functionArgs.user_id);
          break;
        case 'add_income':
          output = await addIncomeTransaction(
            supabase,
            functionArgs.user_id,
            functionArgs.amount,
            functionArgs.source,
            functionArgs.date,
            functionArgs.category
          );
          break;
        case 'add_expense':
          output = await addExpenseTransaction(
            supabase,
            functionArgs.user_id,
            functionArgs.amount,
            functionArgs.category,
            functionArgs.date
          );
          break;
        case 'get_pdf_images':
          output = await getPDFImages(supabase, functionArgs.document_id);
          break;
        default:
          throw new Error(`Function ${functionName} not implemented`);
      }

      toolOutputs.push({
        tool_call_id: toolCall.id,
        output: JSON.stringify(output)
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
