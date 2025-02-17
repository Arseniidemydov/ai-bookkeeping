
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webPush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PushNotificationPayload {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { tokens, title, body, data } = await req.json() as PushNotificationPayload
    const results = [];

    if (!tokens || tokens.length === 0) {
      throw new Error('No device tokens provided')
    }

    // Configure web push
    webPush.setVapidDetails(
      'mailto:arsenii.demydov@gmail.com',
      'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA',
      Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    );

    // Process each token
    for (const token of tokens) {
      try {
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
        console.error(`Failed to send notification to token ${token}:`, error);
        results.push({ type: 'unknown', success: false, error: error.message, token });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
