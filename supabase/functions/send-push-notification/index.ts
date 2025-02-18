
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { initializeApp, cert, getApps } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    console.log('Service account string exists:', !!serviceAccountStr);
    
    if (!serviceAccountStr) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
    }

    const serviceAccount = JSON.parse(serviceAccountStr);
    console.log('Successfully parsed service account JSON');
    console.log('Project ID from service account:', serviceAccount.project_id);
    console.log('Client email from service account:', serviceAccount.client_email);
    
    if (!serviceAccount.project_id) {
      throw new Error('project_id is missing from service account credentials');
    }

    console.log('Initializing Firebase Admin SDK with project:', serviceAccount.project_id);
    
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

async function removeInvalidToken(token: string) {
  console.log('Removing invalid token from database:', token.substring(0, 10) + '...');
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
  console.log('Function invoked with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Received payload:', {
      ...payload,
      token: payload.token ? '[REDACTED]' : undefined,
      user_id: '[REDACTED]'
    });

    if (!payload.token) {
      throw new Error('No token provided');
    }

    // Check if this is a web push subscription token
    let isWebPush = false;
    try {
      const tokenObj = JSON.parse(payload.token);
      isWebPush = !!(tokenObj.endpoint && tokenObj.keys);
      console.log('Token type:', isWebPush ? 'Web Push' : 'Native Push');
    } catch (e) {
      console.log('Token is not a web push subscription');
      isWebPush = false;
    }

    const messaging = getMessaging();
    console.log('Firebase Messaging instance created');

    if (isWebPush) {
      // For web push, extract FCM token from endpoint
      const subscription = JSON.parse(payload.token);
      const fcmEndpoint = subscription.endpoint;
      
      if (fcmEndpoint.includes('fcm.googleapis.com')) {
        const fcmToken = fcmEndpoint.split('/').pop();
        
        if (!fcmToken) {
          throw new Error('Invalid FCM token extracted from endpoint');
        }

        console.log('Sending web push notification with token:', fcmToken.substring(0, 10) + '...');
        
        const message = {
          token: fcmToken,
          notification: {
            title: payload.title || 'New Notification',
            body: payload.body || ''
          },
          webpush: {
            notification: {
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              timestamp: new Date().getTime()
            }
          }
        };

        try {
          await messaging.send(message);
          console.log('Web push notification sent successfully');
        } catch (error) {
          if (error.code === 'messaging/registration-token-not-registered') {
            // Token is invalid or no longer registered
            console.log('Token is invalid or expired, removing from database');
            await removeInvalidToken(payload.token);
            throw new Error('Push notification token is no longer valid');
          }
          throw error;
        }
      }
    } else {
      // For native apps
      console.log('Preparing to send native push notification');
      
      const message = {
        token: payload.token,
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
        }
      };

      try {
        console.log('Sending native push notification...');
        await messaging.send(message);
        console.log('Native push notification sent successfully');
      } catch (error) {
        if (error.code === 'messaging/registration-token-not-registered') {
          // Token is invalid or no longer registered
          console.log('Token is invalid or expired, removing from database');
          await removeInvalidToken(payload.token);
          throw new Error('Push notification token is no longer valid');
        }
        throw error;
      }
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
    console.error('Error details:', {
      code: error.code,
      errorInfo: error.errorInfo,
      message: error.message
    });
    
    // Return a more detailed error response
    return new Response(
      JSON.stringify({ 
        error: error.message,
        errorInfo: error.errorInfo,
        code: error.code,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: corsHeaders, 
        status: 200 // Keep 200 to prevent cascade failure
      }
    );
  }
});
