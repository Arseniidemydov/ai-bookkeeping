
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASSISTANT_ID = "asst_wn94DpzGVJKBFLR4wkh7btD2";
const OPENAI_API_BASE = "https://api.openai.com/v1";
const CANCEL_CHECK_RETRIES = 3;
const CANCEL_CHECK_DELAY = 1000;

async function checkResponseStatus(response: Response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      `API call failed with status ${response.status}: ${
        errorData ? JSON.stringify(errorData) : response.statusText
      }`
    );
  }
  return response;
}

async function waitForRunCancellation(threadId: string, runId: string, headers: Record<string, string>) {
  for (let i = 0; i < CANCEL_CHECK_RETRIES; i++) {
    const response = await fetch(
      `${OPENAI_API_BASE}/threads/${threadId}/runs/${runId}`,
      { headers }
    );
    const runStatus = await response.json();
    
    if (runStatus.status === 'cancelled') {
      console.log(`Run ${runId} successfully cancelled`);
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, CANCEL_CHECK_DELAY));
  }
  return false;
}

async function checkAndCancelActiveRuns(threadId: string, headers: Record<string, string>) {
  try {
    const runsResponse = await fetch(
      `${OPENAI_API_BASE}/threads/${threadId}/runs`,
      { headers }
    );
    const runs = await runsResponse.json();
    
    const activeRuns = runs.data?.filter((run: any) => 
      ['in_progress', 'queued'].includes(run.status)
    );

    if (!activeRuns?.length) {
      return;
    }

    console.log(`Found ${activeRuns.length} active runs to cancel`);
    
    for (const run of activeRuns) {
      console.log(`Attempting to cancel run: ${run.id}`);
      await fetch(
        `${OPENAI_API_BASE}/threads/${threadId}/runs/${run.id}/cancel`,
        { 
          method: 'POST',
          headers 
        }
      );
      
      const cancelled = await waitForRunCancellation(threadId, run.id, headers);
      if (!cancelled) {
        throw new Error(`Failed to cancel run ${run.id}`);
      }
    }
  } catch (error) {
    console.error('Error checking/cancelling active runs:', error);
    throw error; // Propagate the error to handle it in the main flow
  }
}

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

    const headers = {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    // Create or retrieve thread
    let threadId;
    try {
      if (existingThreadId) {
        threadId = existingThreadId;
        // Check and cancel any active runs before proceeding
        await checkAndCancelActiveRuns(threadId, headers);
      } else {
        const response = await checkResponseStatus(await fetch(`${OPENAI_API_BASE}/threads`, {
          method: 'POST',
          headers
        }));
        const thread = await response.json();
        if (!thread.id) throw new Error('No thread ID received from OpenAI');
        threadId = thread.id;
      }
      console.log('Thread created/retrieved:', threadId);
    } catch (error) {
      console.error('Error creating/retrieving thread:', error);
      throw error;
    }

    // Add the message to the thread
    try {
      const messageResponse = await checkResponseStatus(await fetch(`${OPENAI_API_BASE}/threads/${threadId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: "user",
          content: fileUrl ? `${prompt}\nImage URL: ${fileUrl}` : prompt
        })
      }));
      await messageResponse.json(); // Validate response
      console.log('Message added to thread');
    } catch (error) {
      console.error('Error adding message to thread:', error);
      throw error;
    }

    // Run the assistant
    let run;
    try {
      const runResponse = await checkResponseStatus(await fetch(`${OPENAI_API_BASE}/threads/${threadId}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assistant_id: ASSISTANT_ID
        })
      }));
      run = await runResponse.json();
      if (!run.id) throw new Error('No run ID received from OpenAI');
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
      try {
        const statusResponse = await checkResponseStatus(await fetch(
          `${OPENAI_API_BASE}/threads/${threadId}/runs/${run.id}`,
          { headers }
        ));
        runStatus = await statusResponse.json();
        
        if (!runStatus || !runStatus.status) {
          throw new Error('Invalid run status response from OpenAI');
        }
        
        console.log('Run status:', runStatus.status, 'Attempt:', attempts + 1);

        if (runStatus.status === 'completed') {
          break;
        } else if (runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'expired') {
          throw new Error(`Run failed with status: ${runStatus.status}`);
        }

        if (attempts === maxAttempts - 1) {
          throw new Error('Maximum polling attempts reached');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
      } catch (error) {
        console.error('Error polling run status:', error);
        throw error;
      }
    }

    if (runStatus.status === 'completed') {
      try {
        const messagesResponse = await checkResponseStatus(await fetch(
          `${OPENAI_API_BASE}/threads/${threadId}/messages`,
          { headers }
        ));
        const messages = await messagesResponse.json();
        
        if (!messages.data || !messages.data[0] || !messages.data[0].content) {
          throw new Error('Invalid messages response from OpenAI');
        }
        
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
      } catch (error) {
        console.error('Error retrieving messages:', error);
        throw error;
      }
    } else {
      throw new Error(`Run failed with final status: ${runStatus?.status}`);
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
