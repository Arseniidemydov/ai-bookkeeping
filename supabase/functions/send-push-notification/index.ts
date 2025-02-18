
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  console.log('Function invoked with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Received payload:', {
      ...payload,
      user_id: '[REDACTED]' // Don't log sensitive data
    });

    // Check if this is a web push subscription token
    let isWebPush = false;
    try {
      const tokenObj = JSON.parse(payload.token);
      isWebPush = !!(tokenObj.endpoint && tokenObj.keys);
    } catch (e) {
      isWebPush = false;
    }

    if (isWebPush) {
      // For web push, use Firebase Cloud Messaging (FCM)
      const subscription = JSON.parse(payload.token);
      const fcmEndpoint = subscription.endpoint;
      
      if (fcmEndpoint.includes('fcm.googleapis.com')) {
        // Extract FCM token from endpoint
        const fcmToken = fcmEndpoint.split('/').pop();
        
        const fcmPayload = {
          message: {
            token: fcmToken,
            notification: {
              title: payload.title,
              body: payload.body
            },
            webpush: {
              notification: {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                timestamp: new Date().getTime()
              }
            }
          }
        };

        const fcmResponse = await fetch('https://fcm.googleapis.com/v1/projects/your-project-id/messages:send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('FCM_SERVER_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fcmPayload)
        });

        if (!fcmResponse.ok) {
          throw new Error(`FCM request failed: ${await fcmResponse.text()}`);
        }

        console.log('FCM notification sent successfully');
      }
    } else {
      // For native apps, use direct FCM
      const fcmPayload = {
        to: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
          sound: 'default'
        },
        priority: 'high'
      };

      const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${Deno.env.get('FCM_SERVER_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload)
      });

      if (!fcmResponse.ok) {
        throw new Error(`FCM request failed: ${await fcmResponse.text()}`);
      }

      console.log('Native FCM notification sent successfully');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Push notification sent successfully',
        timestamp: new Date().toISOString()
      }),
      { 
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      }
    );

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: corsHeaders, 
        status: 200 // Keep 200 to prevent cascade failure
      }
    );
  }
});
