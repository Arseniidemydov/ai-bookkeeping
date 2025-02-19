
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from './utils/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_ASSISTANT_ID = Deno.env.get('OPENAI_ASSISTANT_ID');

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

if (!OPENAI_ASSISTANT_ID) {
  throw new Error('OPENAI_ASSISTANT_ID environment variable is not set');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();
    console.log('Processing request:', { userId, threadId, hasFileUrl: !!fileUrl });

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Create or use existing thread
    let currentThreadId = threadId;
    if (!currentThreadId) {
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json'
        }
      });

      if (!threadResponse.ok) {
        throw new Error(`Failed to create thread: ${await threadResponse.text()}`);
      }

      const threadData = await threadResponse.json();
      currentThreadId = threadData.id;
      console.log('Created new thread:', currentThreadId);
    }

    // Add message to thread
    const messageContent = fileUrl ? `${prompt}\nImage: ${fileUrl}` : prompt;
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'user',
        content: messageContent
      })
    });

    if (!messageResponse.ok) {
      throw new Error(`Failed to add message: ${await messageResponse.text()}`);
    }

    // Start a new run
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistant_id: OPENAI_ASSISTANT_ID
      })
    });

    if (!runResponse.ok) {
      throw new Error(`Failed to start run: ${await runResponse.text()}`);
    }

    const run = await runResponse.json();
    console.log('Started new run:', run.id);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const statusResponse = await fetch(
        `https://api.openai.com/v1/threads/${currentThreadId}/runs/${run.id}`,
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Failed to get run status: ${await statusResponse.text()}`);
      }

      const status = await statusResponse.json();
      console.log('Run status:', status.status);

      if (status.status === 'completed') {
        const messagesResponse = await fetch(
          `https://api.openai.com/v1/threads/${currentThreadId}/messages`,
          {
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'OpenAI-Beta': 'assistants=v2'
            }
          }
        );

        if (!messagesResponse.ok) {
          throw new Error(`Failed to get messages: ${await messagesResponse.text()}`);
        }

        const messages = await messagesResponse.json();
        const assistantMessage = messages.data.find((msg: any) => 
          msg.role === 'assistant' && msg.content?.[0]?.text?.value
        );

        if (!assistantMessage?.content[0]?.text?.value) {
          throw new Error('No valid response content found');
        }

        return new Response(JSON.stringify({
          generatedText: assistantMessage.content[0].text.value,
          threadId: currentThreadId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (['failed', 'expired', 'cancelled'].includes(status.status)) {
        throw new Error(`Run failed with status: ${status.status}`);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Response timeout');
  } catch (error) {
    console.error('Fatal error in generate-response:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'An unexpected error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
