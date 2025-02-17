
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Log the incoming request method and headers for debugging
  console.log('Received request method:', req.method);
  console.log('Received request headers:', Object.fromEntries(req.headers.entries()));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Log the raw request body
    const rawBody = await req.text();
    console.log('Raw webhook body:', rawBody);

    // Parse the JSON body
    const webhookData = JSON.parse(rawBody);
    console.log('Parsed Plaid webhook data:', JSON.stringify(webhookData, null, 2));

    if (webhookData.webhook_type === 'TRANSACTIONS' && webhookData.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      const { item_id } = webhookData;
      console.log('Processing transaction update for item_id:', item_id);
      
      // Get the user associated with this Plaid item_id
      const { data: connectionData, error: connectionError } = await supabase
        .from('plaid_connections')
        .select('user_id, institution_name')
        .eq('item_id', item_id)
        .single();

      if (connectionError) {
        console.error('Error fetching connection data:', connectionError);
        throw connectionError;
      }

      if (!connectionData) {
        console.error('No connection found for item_id:', item_id);
        throw new Error('No connection found for item_id: ' + item_id);
      }

      console.log('Found connection data:', connectionData);

      // Get the user's device tokens
      const { data: tokens, error: tokensError } = await supabase
        .from('device_tokens')
        .select('token')
        .eq('user_id', connectionData.user_id);

      if (tokensError) {
        console.error('Error fetching device tokens:', tokensError);
        throw tokensError;
      }

      console.log('Found device tokens:', tokens);

      if (tokens && tokens.length > 0) {
        console.log('Sending push notification for tokens:', tokens.map(t => t.token));
        // Send push notification
        const notificationResponse = await supabase.functions.invoke('send-push-notification', {
          body: {
            tokens: tokens.map(t => t.token),
            title: 'New Transactions Available',
            body: `New transactions detected in your ${connectionData.institution_name} account`,
            data: {
              type: 'TRANSACTIONS_UPDATE',
              institution: connectionData.institution_name
            }
          }
        });

        console.log('Push notification response:', notificationResponse);
      } else {
        console.log('No device tokens found for user:', connectionData.user_id);
      }
    } else {
      console.log('Received non-transaction webhook or different webhook code:', webhookData.webhook_type, webhookData.webhook_code);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error processing Plaid webhook:', error);
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
