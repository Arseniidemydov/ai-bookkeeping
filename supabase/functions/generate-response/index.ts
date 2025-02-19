
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
    const run = await startAssistantRun(currentThreadId);
    console.log('Run started with ID:', run.id);
    
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 3; // Reduced from 5 to 3
    const initialDelay = 1000; // Reduced from 2000 to 1000ms
    const maxDelay = 5000; // Reduced from 32000 to 5000ms

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
          const retryAfter = parseFloat(runStatusData.last_error.message.match(/try again in (\d+\.?\d*)s/)?.[1] || "1");
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
      
      const delay = Math.min(
        initialDelay * Math.pow(1.5, attempts), // Changed from 2 to 1.5 for gentler backoff
        maxDelay
      );
      
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
