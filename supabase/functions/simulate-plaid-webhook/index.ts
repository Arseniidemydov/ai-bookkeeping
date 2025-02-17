
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Starting webhook simulation...');
    const { item_id } = await req.json();

    if (!item_id) {
      throw new Error('Missing item_id parameter');
    }

    console.log('Simulating webhook for item_id:', item_id);

    // Create webhook payload that mimics Plaid's webhook
    const webhookPayload = {
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: item_id,
      initial_update_complete: true,
      historical_update_complete: true,
      environment: "sandbox"
    };

    // Send the webhook to our transaction webhook endpoint
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/transaction-webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify(webhookPayload)
      }
    );

    const result = await response.text();
    console.log('Webhook simulation response:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook simulation completed',
        result 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error in webhook simulation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
