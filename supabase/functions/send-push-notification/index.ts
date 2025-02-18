
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

function extractFCMToken(subscription: any): string | null {
  try {
    // If it's already an FCM token
    if (typeof subscription === 'string') {
      return subscription;
    }

    // If it's a web push subscription
    const subscriptionObj = typeof subscription === 'string' 
      ? JSON.parse(subscription) 
      : subscription;

    if (subscriptionObj.endpoint?.includes('fcm.googleapis.com')) {
      return subscriptionObj.endpoint.split('/').pop() || null;
    }

    return null;
  } catch (error) {
    console.error('Error extracting FCM token:', error);
    return null;
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

    const fcmToken = extractFCMToken(payload.token);
    if (!fcmToken) {
      throw new Error('Could not extract valid FCM token');
    }

    console.log('Extracted FCM token:', fcmToken.substring(0, 10) + '...');

    const messaging = getMessaging(firebaseApp);
    
    const message = {
      token: fcmToken,
      notification: {
        title: payload.title || 'New Notification',
        body: payload.body || ''
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
      },
      webpush: {
        notification: {
          icon: '/favicon.ico',
          badge: '/favicon.ico'
        }
      }
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
        code: error.errorInfo?.code || 'UNKNOWN_ERROR',
        message: 'Failed to send push notification'
      }),
      { headers: corsHeaders }
    );
  }
});
