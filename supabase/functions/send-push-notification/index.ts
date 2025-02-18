
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webPush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  console.log('Function invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, data } = await req.json();
    console.log('Received notification request:', { user_id, title, body, data });

    if (!title || !body) {
      throw new Error('Missing required fields: title and body');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!supabaseUrl || !supabaseKey || !VAPID_PRIVATE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Query to get device tokens
    const { data: deviceTokens, error: fetchError } = await supabaseAdmin
      .from('device_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (fetchError) {
      throw new Error(`Error fetching device tokens: ${fetchError.message}`);
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      throw new Error('No device tokens found for user');
    }

    // Configure web push
    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    
    webPush.setVapidDetails(
      'mailto:arsenii.demydov@gmail.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const results = [];

    // Send notifications to all devices
    for (const { token } of deviceTokens) {
      try {
        if (token.startsWith('{')) {
          // Web Push
          const subscription = JSON.parse(token);
          await webPush.sendNotification(
            subscription,
            JSON.stringify({
              title,
              body,
              data: data || {}
            })
          );
          console.log('Web push notification sent successfully');
          results.push({ type: 'web', success: true });
        } else {
          // FCM (mobile)
          const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
          if (!FCM_SERVER_KEY) {
            throw new Error('FCM_SERVER_KEY not set for mobile notifications');
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

          const fcmResult = await response.json();
          console.log('FCM notification sent:', fcmResult);
          results.push({ type: 'fcm', success: true, result: fcmResult });
        }
      } catch (error) {
        console.error('Error sending notification:', error);
        results.push({ success: false, error: error.message });
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
        stack: error.stack 
      }),
      { headers: corsHeaders, status: 500 }
    );
  }
})
