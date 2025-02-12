
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const { prompt, userId, threadId } = await req.json();
    console.log('Received request:', { prompt, userId, threadId });
    
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (txError) throw txError;

    const transactionsContext = transactions ? JSON.stringify(transactions) : '[]';

    // Use existing thread or create new one
    let currentThreadId = threadId;
    if (!currentThreadId) {
      const threadResponse = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (!threadResponse.ok) {
        const errorData = await threadResponse.text();
        throw new Error(`Failed to create thread: ${threadResponse.status} ${errorData}`);
      }

      const thread = await threadResponse.json();
      currentThreadId = thread.id;
    }

    // Add message to thread
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
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

    // Run the assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
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
    
    // Poll for completion
    let runStatus = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${run.id}`, {
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    let runStatusData = await runStatus.json();
    
    let attempts = 0;
    const maxAttempts = 60;
    const checkInterval = 1000;

    while (runStatusData.status === 'in_progress' || runStatusData.status === 'queued') {
      if (attempts >= maxAttempts) {
        throw new Error('Assistant run timed out');
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      runStatus = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      
      runStatusData = await runStatus.json();
      attempts++;
    }

    if (runStatusData.status !== 'completed') {
      throw new Error(`Assistant run failed with status: ${runStatusData.status}`);
    }

    // Get the messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${currentThreadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (!messagesResponse.ok) {
      const errorData = await messagesResponse.text();
      throw new Error(`Failed to get messages: ${messagesResponse.status} ${errorData}`);
    }

    const messages = await messagesResponse.json();
    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No assistant message found in response');
    }

    const generatedText = assistantMessage?.content[0]?.text?.value;
    if (!generatedText) {
      throw new Error('No valid response content found');
    }

    return new Response(JSON.stringify({ 
      generatedText,
      threadId: currentThreadId
    }), {
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
