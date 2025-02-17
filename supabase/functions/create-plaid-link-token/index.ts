
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error('User ID is required');
    }

    // Log environment variables (without exposing sensitive data)
    console.log('Checking Plaid credentials:', {
      hasClientId: !!Deno.env.get('PLAID_CLIENT_ID'),
      hasSecret: !!Deno.env.get('PLAID_SECRET'),
    });

    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID'),
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET'),
        },
      },
    });

    const plaidClient = new PlaidApi(configuration);

    console.log('Creating link token for user:', user_id);

    const request = {
      user: {
        client_user_id: user_id,
      },
      client_name: 'AI Bookkeeping',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      webhook: `${Deno.env.get('SUPABASE_URL')}/functions/v1/plaid-webhook`,
    };

    console.log('Link token request:', request);

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    const linkToken = createTokenResponse.data.link_token;

    console.log('Link token created successfully');

    return new Response(
      JSON.stringify({ link_token: linkToken }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Detailed error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.response?.data || 'No additional details available'
      }),
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
