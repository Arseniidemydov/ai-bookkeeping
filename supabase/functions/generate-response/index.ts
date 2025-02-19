
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

// Optimized timing parameters
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    let lastError;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        console.log(`Attempt ${retries + 1} to send message...`);
        
        const run = await startAssistantRun(currentThreadId);
        let runStatusData = await getRunStatus(currentThreadId, run.id);
        let statusCheckCount = 0;
        
        while (statusCheckCount < 5) {
          console.log(`Status check ${statusCheckCount + 1}, status: ${runStatusData.status}`);
          
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
            console.error('Run failed with status:', runStatusData.status);
            throw new Error(`Assistant run failed with status: ${runStatusData.status}`);
          }

          await delay(RETRY_DELAY);
          runStatusData = await getRunStatus(currentThreadId, run.id);
          statusCheckCount++;
        }

        throw new Error('Status check timeout');
      } catch (error) {
        lastError = error;
        retries++;
        console.error(`Attempt ${retries} failed:`, error);
        
        if (retries === MAX_RETRIES) {
          toast.error("Assistant is not responding. Please try again.");
          throw new Error(`Failed to get response after ${MAX_RETRIES} attempts`);
        }
        
        await delay(RETRY_DELAY);
      }
    }

    throw lastError;
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
