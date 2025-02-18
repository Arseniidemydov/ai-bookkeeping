
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log('Received webhook payload:', payload);

    if (!payload.item_id) {
      throw new Error('No item_id in webhook payload');
    }

    // Get the Plaid connection
    const { data: connection, error: connectionError } = await supabase
      .from('plaid_connections')
      .select('user_id')
      .eq('item_id', payload.item_id)
      .single();

    if (connectionError || !connection) {
      console.error('Error finding Plaid connection:', connectionError);
      throw new Error('No Plaid connection found for this item_id');
    }

    console.log('Processing webhook for user:', connection.user_id);

    // For testing purposes, create a mock transaction
    const mockTransaction = {
      user_id: connection.user_id,
      amount: -50.00,
      description: "Test Transaction",
      category: "Food",
      date: new Date().toISOString(),
      plaid_transaction_id: `test-${Date.now()}`,
      merchant_name: "Test Merchant",
      type: "expense"
    };

    // Insert the mock transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert([mockTransaction])
      .select()
      .single();

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      throw new Error('Failed to create transaction');
    }

    console.log('Created mock transaction:', transaction);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully',
        transaction: transaction
      }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in transaction-webhook:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.stack
      }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
