
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import * as webPush from 'https://esm.sh/web-push@3.6.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  console.log('Function invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body } = await req.json();
    console.log('Processing notification for user:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's device token
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) {
      throw new Error(`Failed to fetch device tokens: ${tokenError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      throw new Error('No device tokens found for user');
    }

    console.log(`Found ${tokens.length} device tokens`);

    // Configure web push
    const VAPID_PUBLIC_KEY = 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA';
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PRIVATE_KEY) {
      throw new Error('VAPID_PRIVATE_KEY is not set');
    }

    webPush.setVapidDetails(
      'mailto:test@example.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const results = [];

    // Send to all user's devices
    for (const { token } of tokens) {
      try {
        const subscription = JSON.parse(token);
        console.log('Sending push notification to subscription:', subscription);
        
        const pushPayload = JSON.stringify({
          title,
          body,
          timestamp: new Date().toISOString()
        });

        await webPush.sendNotification(subscription, pushPayload);
        console.log('Push notification sent successfully');
        results.push({ success: true });
      } catch (error) {
        console.error('Error sending push notification:', error);
        results.push({ success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Push notifications processed',
        results
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack 
      }),
      { 
        headers: corsHeaders,
        status: 500 
      }
    );
  }
});
