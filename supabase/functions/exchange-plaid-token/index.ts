
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Received request to exchange token');
    const { public_token, user_id, metadata } = await req.json();
    console.log('Request payload:', { public_token: '***', user_id, metadata });

    if (!public_token || !user_id || !metadata) {
      console.error('Missing required parameters');
      throw new Error('Missing required parameters');
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID'),
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET'),
        },
      },
    });

    console.log('Initializing Plaid client...');
    const plaidClient = new PlaidApi(configuration);
    
    console.log('Exchanging public token...');
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: public_token
    });
    console.log('Exchange successful:', { item_id: exchangeResponse.data.item_id });

    const access_token = exchangeResponse.data.access_token;
    const item_id = exchangeResponse.data.item_id;
    
    console.log('Initializing Supabase client...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Inserting connection data into database...');
    const { data, error: insertError } = await supabase
      .from('plaid_connections')
      .insert({
        user_id,
        item_id,
        access_token,
        institution_name: metadata.institution.name,
      })
      .select();

    if (insertError) {
      console.error('Database insertion error:', insertError);
      throw insertError;
    }

    console.log('Connection successfully saved:', data);

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
