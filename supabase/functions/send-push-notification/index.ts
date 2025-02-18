
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
  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('token', token);

  if (error) {
    console.error('Error removing invalid token:', error);
  } else {
    console.log('Successfully removed invalid token from database');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Processing notification request:', {
      hasTitle: !!payload.title,
      hasBody: !!payload.body,
      hasToken: !!payload.token
    });

    if (!payload.token) {
      throw new Error('No token provided');
    }

    let isWebPush = false;
    try {
      const tokenObj = JSON.parse(payload.token);
      isWebPush = !!(tokenObj.endpoint && tokenObj.keys);
    } catch {
      isWebPush = false;
    }

    const messaging = getMessaging(firebaseApp);
    let fcmToken = payload.token;

    if (isWebPush) {
      const subscription = JSON.parse(payload.token);
      if (subscription.endpoint?.includes('fcm.googleapis.com')) {
        fcmToken = subscription.endpoint.split('/').pop();
        if (!fcmToken) {
          throw new Error('Invalid FCM token from web push subscription');
        }
      }
    }

    const message = {
      token: fcmToken,
      notification: {
        title: payload.title || 'New Notification',
        body: payload.body || ''
      },
      ...(isWebPush ? {
        webpush: {
          notification: {
            icon: '/favicon.ico',
            badge: '/favicon.ico'
          }
        }
      } : {
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
      })
    };

    try {
      await messaging.send(message);
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
      
      if (error.errorInfo?.code === 'messaging/registration-token-not-registered') {
        await removeInvalidToken(payload.token);
        return new Response(
          JSON.stringify({ 
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
            message: 'Push notification token needs to be refreshed'
          }),
          { headers: corsHeaders }
        );
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        code: error.errorInfo?.code,
        message: 'Failed to send push notification'
      }),
      { headers: corsHeaders }
    );
  }
});
