
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders, handleCORS } from './utils/cors.ts';
import { getTransactionsContext } from './services/transactions.ts';
import { 
  createThread, 
  addMessageToThread, 
  startAssistantRun, 
  getRunStatus, 
  getAssistantMessages 
} from './services/assistant.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

if (!openAIApiKey) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

// Reduced timing parameters for faster failure detection
const MAX_STATUS_CHECKS = 3;
const STATUS_CHECK_DELAY = 1000;
const MAX_RETRIES = 1;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Processing request:', { userId, threadId, hasFileUrl: !!fileUrl });
    
    if (!userId) {
      console.error('Missing userId in request');
      return new Response(JSON.stringify({ 
        error: "User ID is required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      return new Response(JSON.stringify({ 
        error: "OpenAI API key not configured" 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const transactionsContext = await getTransactionsContext(supabase, userId);
    console.log('Retrieved transactions context');

    let currentThreadId = threadId;
    if (!currentThreadId) {
      console.log('Creating new thread');
      currentThreadId = await createThread();
    }

    const messageWithContext = transactionsContext ? 
      `Context: ${transactionsContext}\nUser: ${prompt}` : 
      `User: ${prompt}`;

    console.log('Adding message to thread');
    await addMessageToThread(currentThreadId, messageWithContext, fileUrl);

    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
      try {
        console.log(`Starting assistant run (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        const run = await startAssistantRun(currentThreadId);
        
        for (let checkCount = 0; checkCount < MAX_STATUS_CHECKS; checkCount++) {
          console.log(`Checking run status (check ${checkCount + 1}/${MAX_STATUS_CHECKS})`);
          const runStatus = await getRunStatus(currentThreadId, run.id);
          
          if (runStatus.status === 'completed') {
            console.log('Run completed successfully');
            const messages = await getAssistantMessages(currentThreadId);
            const assistantMessage = messages.data.find((msg: any) => 
              msg.role === 'assistant' && msg.content?.[0]?.text?.value
            );

            if (!assistantMessage?.content[0]?.text?.value) {
              console.error('No valid response content in completed run');
              throw new Error('No valid response content found');
            }

            return new Response(JSON.stringify({ 
              generatedText: assistantMessage.content[0].text.value,
              threadId: currentThreadId
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          if (['failed', 'expired', 'cancelled'].includes(runStatus.status)) {
            console.error(`Run failed with status: ${runStatus.status}`);
            throw new Error(`Run failed with status: ${runStatus.status}`);
          }

          await delay(STATUS_CHECK_DELAY);
        }

        console.error('Status check timeout reached');
        throw new Error('Assistant response timeout');
      } catch (error) {
        console.error(`Run attempt ${retryCount + 1} failed:`, error);
        if (retryCount === MAX_RETRIES) {
          throw error;
        }
        retryCount++;
        await delay(STATUS_CHECK_DELAY);
      }
    }

    throw new Error('All retry attempts failed');
  } catch (error) {
    console.error('Fatal error in generate-response:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
