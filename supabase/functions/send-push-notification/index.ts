
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webpush from 'https://esm.sh/v135/web-push@3.6.7'

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
    // Log request details for debugging
    console.log('Request method:', req.method);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    let requestData;
    try {
      // Parse the request body and log it
      const rawBody = await req.text();
      console.log('Raw request body:', rawBody);
      
      if (!rawBody) {
        throw new Error('Empty request body');
      }

      requestData = JSON.parse(rawBody);
      console.log('Parsed request data:', requestData);
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body format',
          details: parseError.message
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const { user_id, title, body } = requestData;
    
    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields',
          received: { user_id, title, body }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Supabase configuration'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's device tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch device tokens: ${tokenError.message}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No device tokens found for user'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'VAPID_PRIVATE_KEY is not set'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    webpush.setVapidDetails(
      'https://mail.google.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const results = [];
    const errors = [];

    // Send notifications
    for (const { token } of tokens) {
      try {
        const subscription = JSON.parse(token);
        
        const payload = JSON.stringify({
          title,
          body,
          icon: '/favicon.ico',
          timestamp: new Date().toISOString()
        });

        await webpush.sendNotification(subscription, payload);
        results.push({ success: true, subscription: subscription.endpoint });
      } catch (error) {
        console.error('Failed to send notification:', error);
        errors.push({
          error: error.message,
          subscription: token ? JSON.parse(token).endpoint : 'unknown'
        });

        if (error.statusCode === 404 || error.statusCode === 410) {
          try {
            await supabase
              .from('device_tokens')
              .delete()
              .eq('token', token);
            console.log('Removed invalid token:', token);
          } catch (deleteError) {
            console.error('Failed to remove invalid token:', deleteError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notifications processed',
        results,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
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
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        },
        status: 500
      }
    );
  }
});
