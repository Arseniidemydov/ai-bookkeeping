
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { corsHeaders } from "./utils/cors.ts";
import { addExpenseTransaction, addIncomeTransaction } from "./services/transactions.ts";
import { processAssistantResponse } from "./services/assistant.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, userId, threadId, fileUrl } = await req.json();

    if (!prompt) {
      throw new Error('No prompt provided');
    }

    if (!userId) {
      throw new Error('No user ID provided');
    }

    console.log('Received request:', {
      prompt,
      userId,
      threadId: threadId || 'new thread',
      hasFile: !!fileUrl
    });

    const response = await processAssistantResponse(
      supabase,
      prompt,
      userId,
      threadId,
      fileUrl
    );

    return new Response(
      JSON.stringify(response),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error in generate-response:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
