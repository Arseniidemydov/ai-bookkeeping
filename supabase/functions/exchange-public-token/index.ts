
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log('Edge function loaded and ready'); // Test log

serve(async (req: Request) => {
  console.log('Received request to exchange-public-token'); // Test log at entry point
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Request method:', req.method); // Log request method
    const body = await req.json();
    console.log('Received request body:', { ...body, public_token: '[REDACTED]' }); // Log request body safely
    
    const { public_token, user_id } = body;
    
    if (!public_token || !user_id) {
      console.error('Missing required fields');
      throw new Error('Public token and user ID are required');
    }

    // Check environment variables
    const clientId = Deno.env.get('PLAID_CLIENT_ID');
    const secret = Deno.env.get('PLAID_SECRET');
    
    if (!clientId || !secret) {
      console.error('Missing Plaid credentials');
      throw new Error('Plaid credentials not configured');
    }

    console.log('Exchanging public token with Plaid...');
    const response = await fetch('https://sandbox.plaid.com/item/public_token/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
      body: JSON.stringify({
        public_token,
      }),
    });

    const data = await response.json();
    console.log('Plaid exchange response status:', response.status);
    
    if (!response.ok) {
      console.error('Plaid API error:', data);
      throw new Error(data.error_message || 'Failed to exchange token');
    }

    // Get institution info
    console.log('Fetching institution info...');
    const institutionResponse = await fetch('https://sandbox.plaid.com/institutions/get_by_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
      body: JSON.stringify({
        institution_id: data.item.institution_id,
        country_codes: ['US'],
      }),
    });

    const institutionData = await institutionResponse.json();
    console.log('Institution data received:', !!institutionData);

    // Save to Supabase
    console.log('Saving to Supabase...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials');
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase
      .from('plaid_connections')
      .insert({
        user_id,
        access_token: data.access_token,
        item_id: data.item.item_id,
        institution_id: data.item.institution_id,
        institution_name: institutionData.institution.name,
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log('Successfully saved Plaid connection');
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in exchange-public-token:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: JSON.stringify(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
