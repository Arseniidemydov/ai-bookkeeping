
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    const transaction = payload.record
    const userId = transaction.user_id

    // Get user's device token
    const { data: deviceToken, error: tokenError } = await supabaseClient
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId)
      .single()

    if (tokenError || !deviceToken) {
      throw new Error('No device token found for user')
    }

    // Format the transaction amount
    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(transaction.amount))

    // Send push notification
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          tokens: [deviceToken.token],
          title: 'New Transaction',
          body: `${transaction.type === 'expense' ? 'Expense' : 'Income'}: ${amount}`,
          data: {
            transactionId: transaction.id.toString(),
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to send push notification')
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
