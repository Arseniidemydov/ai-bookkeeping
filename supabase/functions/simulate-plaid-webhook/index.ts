
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user ID from the request JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    console.log('Looking up Plaid connection for user:', user.id);

    // Get the Plaid connection for this user
    const { data: connection, error: connectionError } = await supabase
      .from('plaid_connections')
      .select('item_id')
      .eq('user_id', user.id)
      .single();

    if (connectionError || !connection) {
      console.error('Error fetching Plaid connection:', connectionError);
      throw new Error('No Plaid connection found for this user');
    }

    console.log('Found Plaid connection with item_id:', connection.item_id);

    // Create a simulated webhook payload
    const webhookPayload = {
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: connection.item_id,
      initial_update_complete: true,
      historical_update_complete: true
    };

    console.log('Simulating webhook with payload:', webhookPayload);

    // Call the plaid-webhook function
    const { error: webhookError } = await supabase.functions.invoke('plaid-webhook', {
      body: webhookPayload
    });

    if (webhookError) {
      console.error('Error calling webhook:', webhookError);
      throw webhookError;
    }

    console.log('Webhook simulation completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook simulation completed successfully',
        webhook_payload: webhookPayload
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error simulating webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
