
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders, handleCORS } from './utils/cors.ts';
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

// Reduced attempts but increased initial delay for better success rate
const MAX_ATTEMPTS = 5;
const INITIAL_DELAY = 2000; // Start with 2 seconds
const MAX_TOTAL_TIME = 15000; // Maximum 15 seconds total wait time

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
    let run = await startAssistantRun(currentThreadId);
    console.log('Run started with ID:', run.id);
    
    const startTime = Date.now();
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      console.log(`Run status check #${attempts + 1}. Status: ${runStatusData.status}`);
      
      // Check if we've exceeded our total time limit
      if (Date.now() - startTime > MAX_TOTAL_TIME) {
        console.error('Exceeded maximum total time limit');
        throw new Error('The request is taking longer than expected. Please try again.');
      }

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
        // Handle rate limits specifically
        if (runStatusData.last_error?.code === 'rate_limit_exceeded') {
          console.log('Rate limit exceeded. Retrying...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          run = await startAssistantRun(currentThreadId);
          runStatusData = await getRunStatus(currentThreadId, run.id);
          continue;
        }

        const error = `Run failed with status: ${runStatusData.status}. Last status data: ${JSON.stringify(runStatusData)}`;
        console.error(error);
        throw new Error(error);
      }
      
      const currentDelay = INITIAL_DELAY;
      console.log(`Waiting ${currentDelay}ms before next status check...`);
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      
      runStatusData = await getRunStatus(currentThreadId, run.id);
      attempts++;
    }

    console.error('Maximum attempts reached. Final status:', runStatusData.status);
    throw new Error('Unable to get a response from the assistant. Please try again.');
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
