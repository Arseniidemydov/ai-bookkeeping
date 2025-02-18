
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as webPush from "https://esm.sh/web-push@3.6.6";

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

    // Set VAPID details
    webPush.setVapidDetails(
      'mailto:your-email@example.com', // Replace with your email
      'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA',
      Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    );

    // Parse the subscription from the token
    let subscription;
    try {
      subscription = JSON.parse(payload.token);
    } catch (error) {
      console.error('Error parsing subscription:', error);
      throw new Error('Invalid subscription format');
    }

    console.log('Sending notification to subscription:', {
      endpoint: subscription.endpoint,
      // Don't log the full keys for security
      keys: subscription.keys ? { 
        p256dh: subscription.keys.p256dh?.substring(0, 10) + '...',
        auth: subscription.keys.auth?.substring(0, 10) + '...'
      } : 'No keys'
    });

    // Prepare the notification payload
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: '/favicon.ico', // You can customize this
      badge: '/favicon.ico',
      timestamp: new Date().getTime()
    });

    // Send the notification
    const pushResult = await webPush.sendNotification(
      subscription,
      notificationPayload
    );

    console.log('Push notification sent successfully:', {
      statusCode: pushResult.statusCode,
      body: pushResult.body
    });

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
