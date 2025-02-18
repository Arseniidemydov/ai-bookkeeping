
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { 
  initializeApp as initializeFirebaseApp,
  cert
} from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Firebase Admin
let firebaseApp;
try {
  const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!serviceAccountStr) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
  }

  const serviceAccount = JSON.parse(serviceAccountStr);
  
  firebaseApp = initializeFirebaseApp({
    credential: cert(serviceAccount)
  });
  
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  throw error;
}

async function removeInvalidToken(token: string) {
  console.log('Removing invalid token from database');
  try {
    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('token', token);

    if (error) {
      console.error('Error removing invalid token:', error);
    } else {
      console.log('Successfully removed invalid token from database');
    }
  } catch (error) {
    console.error('Error in removeInvalidToken:', error);
  }
}

function parseToken(token: string) {
  try {
    return JSON.parse(token);
  } catch {
    return token;
  }
}

interface WebPushSubscription {
  endpoint?: string;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
}

function isWebPushSubscription(obj: any): obj is WebPushSubscription {
  return typeof obj === 'object' && obj !== null && 
         ('endpoint' in obj || ('keys' in obj && typeof obj.keys === 'object'));
}

async function sendPushNotification(token: string | WebPushSubscription, title: string, body: string) {
  const messaging = getMessaging(firebaseApp);
  
  if (isWebPushSubscription(token)) {
    console.log('Sending web push notification');
    const message = {
      webpush: {
        headers: {
          TTL: '86400'
        },
        notification: {
          title,
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          vibrate: [100, 50, 100],
          requireInteraction: true
        },
        fcmOptions: {
          link: '/'
        }
      },
      topic: 'all' // Using topic-based messaging for web push
    };

    return await messaging.send(message);
  } else {
    console.log('Sending FCM notification');
    const message = {
      token: typeof token === 'string' ? token : '',
      notification: {
        title,
        body
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

    return await messaging.send(message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Received notification payload:', {
      hasTitle: !!payload.title,
      hasBody: !!payload.body,
      tokenLength: payload.token?.length
    });

    if (!payload.token) {
      throw new Error('No token provided');
    }

    const parsedToken = parseToken(payload.token);
    console.log('Parsed token type:', typeof parsedToken);
    console.log('Token structure:', JSON.stringify(parsedToken, null, 2));

    try {
      await sendPushNotification(
        parsedToken,
        payload.title || 'New Notification',
        payload.body || ''
      );

      console.log('Push notification sent successfully');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Push notification sent successfully'
        }),
        { headers: corsHeaders }
      );
    } catch (error) {
      console.error('Firebase messaging error:', error);
      
      if (error.errorInfo?.code === 'messaging/registration-token-not-registered' ||
          error.errorInfo?.code === 'messaging/invalid-argument') {
        await removeInvalidToken(payload.token);
        return new Response(
          JSON.stringify({ 
            error: 'Token invalid or expired',
            code: 'TOKEN_INVALID',
            message: 'Push notification token needs to be refreshed'
          }),
          { headers: corsHeaders, status: 400 }
        );
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        code: error.errorInfo?.code || 'UNKNOWN_ERROR',
        message: 'Failed to send push notification'
      }),
      { headers: corsHeaders, status: 500 }
    );
  }
});
