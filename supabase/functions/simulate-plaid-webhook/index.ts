
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
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Looking up Plaid connection for user:', user.id);

    // Get or create the Plaid connection
    let connection;
    const { data: existingConnection, error: connectionError } = await supabase
      .from('plaid_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('item_id', 'AaxNjwj6JxhBDlWd58wxuXAKKnlQXqC16rmwk')
      .maybeSingle();

    if (!existingConnection) {
      console.log('Creating new Plaid connection...');
      const { data: newConnection, error: insertError } = await supabase
        .from('plaid_connections')
        .insert({
          user_id: user.id,
          item_id: 'AaxNjwj6JxhBDlWd58wxuXAKKnlQXqC16rmwk',
          access_token: 'access-sandbox-test',
          institution_name: 'Test Bank'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating Plaid connection:', insertError);
        throw new Error('Failed to create Plaid connection');
      }
      connection = newConnection;
    } else {
      connection = existingConnection;
    }

    console.log('Using Plaid connection:', {
      item_id: connection.item_id,
      institution: connection.institution_name
    });

    // Create a simulated webhook payload
    const webhookPayload = {
      webhook_type: "TRANSACTIONS",
      webhook_code: "SYNC_UPDATES_AVAILABLE",
      item_id: connection.item_id,
      initial_update_complete: true,
      historical_update_complete: true,
      environment: "sandbox"
    };

    console.log('Calling transaction-webhook with payload:', webhookPayload);

    const { data: webhookResponse, error: webhookError } = await supabase.functions.invoke('transaction-webhook', {
      body: webhookPayload
    });

    if (webhookError) {
      console.error('Error from transaction-webhook:', webhookError);
      throw new Error(`Failed to trigger webhook: ${webhookError.message}`);
    }

    console.log('Webhook simulation completed successfully:', webhookResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook simulation completed successfully',
        webhook_response: webhookResponse
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in simulate-plaid-webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.stack
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
