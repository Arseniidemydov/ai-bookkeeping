
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { Configuration, PlaidApi, PlaidEnvironments } from 'https://esm.sh/plaid@12.3.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { public_token, user_id } = await req.json()
    if (!public_token || !user_id) {
      throw new Error('Public token and user ID are required')
    }

    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID'),
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET'),
        },
      },
    })

    const client = new PlaidApi(configuration)
    
    // Exchange public token for access token
    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: public_token,
    })

    const access_token = exchangeResponse.data.access_token
    const item_id = exchangeResponse.data.item_id

    // Get institution details
    const item = await client.itemGet({ access_token })
    const institution = await client.institutionsGetById({
      institution_id: item.data.item.institution_id,
      country_codes: ['US'],
    })

    // Store the connection in Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: insertError } = await supabase
      .from('plaid_connections')
      .insert({
        user_id,
        access_token,
        item_id,
        institution_name: institution.data.institution.name,
      })

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
