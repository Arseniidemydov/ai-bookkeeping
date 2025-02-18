
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { initializeApp, credential, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-admin-app.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-admin-messaging.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  const serviceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
  
  initializeApp({
    credential: credential.cert(serviceAccount),
    projectId: "ai-bookeeping-app"
  });
}

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

    const messaging = getMessaging();

    if (isWebPush) {
      // For web push, extract FCM token from endpoint
      const subscription = JSON.parse(payload.token);
      const fcmEndpoint = subscription.endpoint;
      
      if (fcmEndpoint.includes('fcm.googleapis.com')) {
        const fcmToken = fcmEndpoint.split('/').pop();
        
        console.log('Sending web push notification with token:', fcmToken?.substring(0, 10) + '...');
        
        const message = {
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
        };

        await messaging.send(message);
        console.log('Web push notification sent successfully');
      }
    } else {
      // For native apps
      console.log('Sending native push notification');
      
      const message = {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body
        },
        android: {
          notification: {
            icon: 'ic_launcher',
            sound: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default'
            }
          }
        }
      };

      await messaging.send(message);
      console.log('Native push notification sent successfully');
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
