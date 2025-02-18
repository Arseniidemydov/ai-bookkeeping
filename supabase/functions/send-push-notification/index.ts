
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webPush from 'https://esm.sh/web-push@3.6.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  // Log request details
  console.log('Request received:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries())
  });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate request method
    if (req.method !== 'POST') {
      throw new Error(`Invalid method: ${req.method}`);
    }

    // Parse request body
    const requestData = await req.json().catch(err => {
      console.error('Failed to parse request body:', err);
      throw new Error('Invalid request body');
    });

    console.log('Request data:', {
      ...requestData,
      user_id: '[REDACTED]' // Don't log sensitive data
    });

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
      console.error('Database error:', tokenError);
      throw new Error(`Failed to fetch device tokens: ${tokenError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      throw new Error('No device tokens found for user');
    }

    console.log(`Found ${tokens.length} device tokens`);

    // Configure web push
    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PRIVATE_KEY) {
      throw new Error('VAPID_PRIVATE_KEY is not set');
    }

    webPush.setVapidDetails(
      'mailto:test@example.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const results = [];

    // Send notifications
    for (const { token } of tokens) {
      try {
        const subscription = JSON.parse(token);
        console.log('Processing subscription:', {
          endpoint: subscription.endpoint,
          keys: subscription.keys ? '[PRESENT]' : '[MISSING]'
        });

        const pushPayload = JSON.stringify({
          title,
          body,
          timestamp: new Date().toISOString()
        });

        await webPush.sendNotification(subscription, pushPayload);
        console.log('Push notification sent successfully');
        results.push({ success: true });
      } catch (error) {
        console.error('Error sending push notification:', error);
        results.push({ success: false, error: error.message });
      }
    }

    const response = {
      success: true,
      message: 'Push notifications processed',
      results,
      timestamp: new Date().toISOString()
    };

    console.log('Sending response:', response);

    return new Response(
      JSON.stringify(response),
      { 
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      }
    );

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: corsHeaders,
        status: error.status || 500
      }
    );
  }
});
