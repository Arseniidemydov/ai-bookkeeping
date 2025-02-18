
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";

const openai = new OpenAI({
  apiKey: Deno.env.get('OPENAI_API_KEY')!,
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v2'
  }
});

const ASSISTANT_ID = "asst_wn94DpzGVJKBFLR4wkh7btD2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { prompt, userId, threadId: existingThreadId, fileUrl } = await req.json();
    console.log('Request received:', { prompt, userId, existingThreadId, fileUrl });

    // Create or retrieve thread
    const threadId = existingThreadId || (await openai.beta.threads.create()).id;
    console.log('Using thread:', threadId);

    // Add the message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: fileUrl ? `${prompt}\nImage URL: ${fileUrl}` : prompt,
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
    });

    // Poll for completion
    let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 1000; // 1 second

    while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
      console.log('Run status:', runStatus.status, 'Attempt:', attempts + 1);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
      attempts++;
    }

    if (runStatus.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(threadId);
      const lastMessage = messages.data[0];
      const generatedText = lastMessage.content[0].type === 'text' ? lastMessage.content[0].text.value : '';

      return new Response(
        JSON.stringify({ 
          generatedText,
          threadId
        }),
        {
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    } else {
      throw new Error(`Run failed with status: ${runStatus.status}`);
    }
  } catch (error) {
    console.error('Error in generate-response:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
