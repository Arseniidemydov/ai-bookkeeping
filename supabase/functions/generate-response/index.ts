
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSISTANT_ID = "asst_wn94DpzGVJKBFLR4wkh7btD2";
const OPENAI_API_BASE = "https://api.openai.com/v1";

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

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not found');
    }

    // Create or retrieve thread
    let threadId;
    try {
      if (existingThreadId) {
        threadId = existingThreadId;
      } else {
        const response = await fetch(`${OPENAI_API_BASE}/threads`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v1'
          }
        });
        const thread = await response.json();
        threadId = thread.id;
      }
      console.log('Thread created/retrieved:', threadId);
    } catch (error) {
      console.error('Error creating/retrieving thread:', error);
      throw error;
    }

    // Add the message to the thread
    try {
      await fetch(`${OPENAI_API_BASE}/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({
          role: "user",
          content: fileUrl ? `${prompt}\nImage URL: ${fileUrl}` : prompt
        })
      });
      console.log('Message added to thread');
    } catch (error) {
      console.error('Error adding message to thread:', error);
      throw error;
    }

    // Run the assistant
    let run;
    try {
      const runResponse = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v1'
        },
        body: JSON.stringify({
          assistant_id: ASSISTANT_ID
        })
      });
      run = await runResponse.json();
      console.log('Assistant run created:', run.id);
    } catch (error) {
      console.error('Error creating assistant run:', error);
      throw error;
    }

    // Poll for completion
    let runStatus;
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 1000;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      runStatus = await statusResponse.json();
      console.log('Run status:', runStatus.status, 'Attempt:', attempts + 1);

      if (runStatus.status === 'completed') {
        break;
      } else if (runStatus.status === 'failed') {
        throw new Error('Run failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
    }

    if (runStatus.status === 'completed') {
      const messagesResponse = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/messages`, {
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      const messages = await messagesResponse.json();
      const lastMessage = messages.data[0];
      const generatedText = lastMessage.content[0].type === 'text' ? lastMessage.content[0].text.value : '';

      console.log('Generated response successfully');

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
