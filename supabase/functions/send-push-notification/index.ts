
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
  console.log('Request URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Initial environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      hasVapidKey: !!Deno.env.get('VAPID_PRIVATE_KEY'),
      hasFcmKey: !!Deno.env.get('FCM_SERVER_KEY')
    });

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required Supabase environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const payload = await req.json();
    
    console.log('Received request payload:', {
      ...payload,
      user_id: payload.user_id ? '[REDACTED]' : undefined
    });

    // Return a simple success response for initial testing
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Function executed successfully',
        environment: {
          hasSupabaseUrl: !!supabaseUrl,
          hasSupabaseKey: !!supabaseKey,
          hasVapidKey: !!Deno.env.get('VAPID_PRIVATE_KEY'),
          hasFcmKey: !!Deno.env.get('FCM_SERVER_KEY')
        }
      }),
      { 
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-cache'
        }
      }
    );

  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: corsHeaders, 
        status: 500 
      }
    );
  }
})
