
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

    const payload = await req.json();
    console.log('Received webhook payload:', payload);

    if (!payload.item_id) {
      throw new Error('No item_id in webhook payload');
    }

    // Get the Plaid connection to find the user
    const { data: connection, error: connectionError } = await supabase
      .from('plaid_connections')
      .select('user_id, institution_name')
      .eq('item_id', payload.item_id)
      .maybeSingle();

    if (connectionError || !connection) {
      console.error('Error finding Plaid connection:', connectionError);
      throw new Error('No Plaid connection found for this item_id');
    }

    console.log('Processing webhook for user:', connection.user_id);

    // Get the user's device tokens
    const { data: deviceTokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', connection.user_id);

    if (tokenError) {
      console.error('Error fetching device tokens:', tokenError);
      throw new Error('Failed to fetch device tokens');
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log('No device tokens found for user');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No device tokens found to send notifications to'
        }),
        { 
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(`Found ${deviceTokens.length} device tokens`);

    // Prepare notification message based on webhook type
    let notificationTitle = 'Bank Update';
    let notificationBody = `New update from ${connection.institution_name || 'your bank'}`;

    if (payload.webhook_type === 'TRANSACTIONS' && payload.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      notificationTitle = 'New Transactions Available';
      notificationBody = `New transactions are available from ${connection.institution_name || 'your bank'}`;
    }

    // Call the send-push-notification function for each device token
    const notificationPromises = deviceTokens.map(({ token }) => 
      supabase.functions.invoke('send-push-notification', {
        body: {
          token,
          title: notificationTitle,
          body: notificationBody
        }
      })
    );

    const notificationResults = await Promise.allSettled(notificationPromises);
    console.log('Push notification results:', notificationResults);

    const successfulNotifications = notificationResults.filter(result => result.status === 'fulfilled');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed webhook and sent ${successfulNotifications.length} notifications`,
        notification_results: notificationResults
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in transaction-webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, // Keep 200 to prevent cascade failure
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
