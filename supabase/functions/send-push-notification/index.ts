
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import { setVapidDetails, sendNotification } from 'https://esm.sh/web-push@3.6.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const requestData = await req.json();
    const { user_id, title, body } = requestData;

    if (!user_id || !title || !body) {
      throw new Error('Missing required fields: user_id, title, or body');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's device tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) {
      throw new Error(`Failed to fetch device tokens: ${tokenError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      throw new Error('No device tokens found for user');
    }

    // Configure web push
    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PRIVATE_KEY) {
      throw new Error('VAPID_PRIVATE_KEY is not set');
    }

    try {
      setVapidDetails(
        'mailto:test@example.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
      );
    } catch (error) {
      console.error('Failed to set VAPID details:', error);
      throw new Error(`Failed to initialize web push: ${error.message}`);
    }

    const results = [];
    const errors = [];

    // Send notifications
    for (const { token } of tokens) {
      try {
        const subscription = JSON.parse(token);
        
        const pushPayload = JSON.stringify({
          title,
          body,
          timestamp: new Date().toISOString()
        });

        await sendNotification(subscription, pushPayload);
        results.push({ success: true, subscription: subscription.endpoint });
      } catch (error) {
        console.error('Failed to send notification:', error);
        errors.push({
          error: error.message,
          subscription: token ? JSON.parse(token).endpoint : 'unknown'
        });
      }
    }

    if (errors.length > 0 && errors.length === tokens.length) {
      // All notifications failed
      throw new Error('Failed to send all notifications: ' + JSON.stringify(errors));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notifications processed',
        results,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: corsHeaders,
        status: 500
      }
    );
  }
});
