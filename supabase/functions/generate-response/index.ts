
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate OpenAI API key
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const { prompt, userId } = await req.json();
    console.log('Received request:', { prompt, userId });
    
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    // Fetch user's transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (txError) throw txError;

    // Prepare transactions context
    const transactionsContext = transactions ? JSON.stringify(transactions) : '[]';
    console.log('Fetched transactions for context');

    // Create a thread with error response checking
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      }
    });

    if (!threadResponse.ok) {
      const errorData = await threadResponse.text();
      console.error('Thread creation failed with status:', threadResponse.status, 'Error:', errorData);
      throw new Error(`Failed to create thread: ${threadResponse.status} ${errorData}`);
    }

    const thread = await threadResponse.json();
    if (!thread.id) {
      console.error('Thread creation failed - invalid response:', thread);
      throw new Error('Failed to create thread - invalid response format');
    }
    console.log('Created thread:', thread.id);

    // Add a message to the thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        role: 'user',
        content: `Context: Here are my recent transactions: ${transactionsContext}\n\nQuestion: ${prompt}`
      })
    });

    if (!messageResponse.ok) {
      const errorData = await messageResponse.text();
      throw new Error(`Failed to add message: ${messageResponse.status} ${errorData}`);
    }
    console.log('Added message to thread');

    // Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        assistant_id: 'asst_wn94DpzGVJKBFLR4wkh7btD2'
      })
    });

    if (!runResponse.ok) {
      const errorData = await runResponse.text();
      throw new Error(`Failed to start run: ${runResponse.status} ${errorData}`);
    }

    const run = await runResponse.json();
    console.log('Started assistant run:', run.id);

    // Poll for completion
    let runStatus = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    
    let runStatusData = await runStatus.json();
    console.log('Initial run status:', runStatusData.status);
    
    let attempts = 0;
    const maxAttempts = 60;
    const checkInterval = 1000; // 1 second

    while (runStatusData.status === 'in_progress' || runStatusData.status === 'queued') {
      if (attempts >= maxAttempts) {
        throw new Error('Assistant run timed out');
      }
      
      console.log(`Polling attempt ${attempts + 1}/${maxAttempts}, status: ${runStatusData.status}`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      runStatus = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'OpenAI-Beta': 'assistants=v1'
        }
      });
      
      runStatusData = await runStatus.json();
      attempts++;
    }

    if (runStatusData.status !== 'completed') {
      throw new Error(`Assistant run failed with status: ${runStatusData.status}`);
    }

    // Get the messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });

    if (!messagesResponse.ok) {
      const errorData = await messagesResponse.text();
      throw new Error(`Failed to get messages: ${messagesResponse.status} ${errorData}`);
    }

    const messages = await messagesResponse.json();
    console.log('Retrieved messages');

    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');
    if (!assistantMessage) {
      throw new Error('No assistant message found in response');
    }

    const generatedText = assistantMessage?.content[0]?.text?.value;
    if (!generatedText) {
      throw new Error('No valid response content found');
    }
    console.log('Successfully generated response');

    return new Response(JSON.stringify({ generatedText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
