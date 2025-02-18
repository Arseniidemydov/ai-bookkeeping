
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { corsHeaders } from './utils/cors.ts';
import { 
  createThread, 
  addMessageToThread, 
  startAssistantRun,
  getRunStatus,
  getAssistantMessages,
  listRunsForThread,
  cancelRun
} from './services/assistant.ts';

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

    let currentThreadId = threadId;
    
    // If we have a threadId, check for and cleanup any abandoned runs
    if (currentThreadId) {
      try {
        const runs = await listRunsForThread(currentThreadId);
        for (const run of runs.data || []) {
          if (run.status === 'in_progress') {
            console.log(`Found in-progress run ${run.id}, attempting to cancel...`);
            try {
              await cancelRun(currentThreadId, run.id);
              console.log(`Successfully cancelled run ${run.id}`);
              // Add a small delay after cancelling
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (cancelError) {
              console.error(`Failed to cancel run ${run.id}:`, cancelError);
            }
          }
        }
      } catch (error) {
        console.error('Error checking thread runs:', error);
      }
    }

    // If no threadId provided, create a new thread
    if (!currentThreadId) {
      currentThreadId = await createThread();
    }

    await addMessageToThread(currentThreadId, prompt, fileUrl);

    console.log('Starting assistant run...');
    const run = await startAssistantRun(currentThreadId);
    console.log('Run started with ID:', run.id);
    
    let runStatusData = await getRunStatus(currentThreadId, run.id);
    let attempts = 0;
    const maxAttempts = 10;
    const initialDelay = 3000;
    const maxDelay = 60000;

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
        throw new Error(`Run failed with status: ${runStatusData.status}`);
      }
      
      const delay = Math.min(
        initialDelay * Math.pow(2, attempts), 
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
