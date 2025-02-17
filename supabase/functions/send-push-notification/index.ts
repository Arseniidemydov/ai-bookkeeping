
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webPush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

interface PushNotificationPayload {
  user_id?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  console.log('Function invoked with method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Supabase URL available:', !!supabaseUrl);
    console.log('Supabase key available:', !!supabaseKey);

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Log request headers for debugging
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    const payload = await req.json() as PushNotificationPayload;
    console.log('Received payload:', payload);
    
    const { user_id, title, body, data } = payload;

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: title and body' }),
        { headers: corsHeaders, status: 400 }
      );
    }

    // Query to get device tokens
    let query = supabaseAdmin
      .from('device_tokens')
      .select('token');

    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data: deviceTokens, error: fetchError } = await query;
    console.log('Device tokens query result:', { tokens: deviceTokens?.length, error: fetchError });

    if (fetchError) {
      console.error('Error fetching tokens:', fetchError);
      return new Response(
        JSON.stringify({ error: `Error fetching device tokens: ${fetchError.message}` }),
        { headers: corsHeaders, status: 500 }
      );
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No device tokens found' }),
        { headers: corsHeaders, status: 404 }
      );
    }

    // Configure web push
    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    
    if (!VAPID_PRIVATE_KEY) {
      throw new Error('VAPID_PRIVATE_KEY is not set');
    }

    console.log('VAPID keys available:', {
      public: !!VAPID_PUBLIC_KEY,
      private: !!VAPID_PRIVATE_KEY
    });

    webPush.setVapidDetails(
      'mailto:arsenii.demydov@gmail.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const results = [];

    // Process each token
    for (const { token } of deviceTokens) {
      try {
        console.log('Processing token:', token.substring(0, 20) + '...');
        
        // Check if the token is a web push subscription (it will be a JSON string)
        if (token.startsWith('{')) {
          // Web Push
          const subscription = JSON.parse(token);
          await webPush.sendNotification(subscription, JSON.stringify({
            title,
            body,
            data: data || {}
          }));
          results.push({ type: 'web', success: true, token });
        } else {
          // FCM (mobile)
          const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
          if (!FCM_SERVER_KEY) {
            throw new Error('FCM_SERVER_KEY is not set');
          }

          const response = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `key=${FCM_SERVER_KEY}`,
            },
            body: JSON.stringify({
              to: token,
              notification: {
                title,
                body,
              },
              data: data || {},
            }),
          });

          if (!response.ok) {
            throw new Error(`FCM request failed: ${response.statusText}`);
          }

          const result = await response.json();
          results.push({ type: 'fcm', success: true, result, token });
        }
      } catch (error) {
        console.error(`Failed to send notification to token:`, error);
        results.push({ type: 'unknown', success: false, error: error.message, token });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { headers: corsHeaders, status: 500 }
    );
  }
})
