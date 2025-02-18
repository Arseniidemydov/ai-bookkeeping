
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { Configuration, PlaidApi, PlaidEnvironments } from "npm:plaid@12.3.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID'),
        'PLAID-SECRET': Deno.env.get('PLAID_SECRET'),
      },
    },
  })
);

async function syncTransactions(accessToken: string, userId: string) {
  try {
    console.log('Starting transaction sync for user:', userId);
    
    // Initialize sync
    const syncResponse = await plaidClient.transactionsSync({
      access_token: accessToken,
      options: {
        include_personal_finance_category: true
      }
    });

    const { added, modified, removed } = syncResponse.data;
    console.log(`Found ${added.length} new, ${modified.length} modified, and ${removed.length} removed transactions`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Handle new transactions
    if (added.length > 0) {
      const newTransactions = added.map(transaction => ({
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.name,
        category: transaction.personal_finance_category?.primary,
        type: transaction.amount > 0 ? 'expense' : 'income',
        user_id: userId
      }));

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(newTransactions);

      if (insertError) {
        console.error('Error inserting new transactions:', insertError);
        throw insertError;
      }
      console.log(`Successfully inserted ${added.length} new transactions`);
    }

    // Handle modified transactions
    if (modified.length > 0) {
      for (const transaction of modified) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            amount: transaction.amount,
            date: transaction.date,
            description: transaction.name,
            category: transaction.personal_finance_category?.primary,
            type: transaction.amount > 0 ? 'expense' : 'income'
          })
          .eq('description', transaction.name)
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating transaction:', updateError);
        }
      }
      console.log(`Successfully processed ${modified.length} modified transactions`);
    }

    // Handle removed transactions
    if (removed.length > 0) {
      const removedTransactionIds = removed.map(t => t.transaction_id);
      console.log('Attempting to remove transactions:', removedTransactionIds);
      
      const { error: deleteError } = await supabase
        .from('transactions')
        .delete()
        .in('description', removed.map(t => t.name))
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Error deleting transactions:', deleteError);
      } else {
        console.log(`Successfully removed ${removed.length} transactions`);
      }
    }

    return true;
  } catch (error) {
    console.error('Error syncing transactions:', error);
    throw error;
  }
}

serve(async (req) => {
  // Log the incoming request method and headers for debugging
  console.log('Received request method:', req.method);
  console.log('Received request headers:', Object.fromEntries(req.headers.entries()));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Log the raw request body
    const rawBody = await req.text();
    console.log('Raw webhook body:', rawBody);

    // Parse the JSON body
    const webhookData = JSON.parse(rawBody);
    console.log('Parsed Plaid webhook data:', JSON.stringify(webhookData, null, 2));

    if (webhookData.webhook_type === 'TRANSACTIONS' && webhookData.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      const { item_id } = webhookData;
      console.log('Processing transaction update for item_id:', item_id);
      
      // Get the user associated with this Plaid item_id
      const { data: connectionData, error: connectionError } = await supabase
        .from('plaid_connections')
        .select('user_id, institution_name, access_token')
        .eq('item_id', item_id)
        .single();

      if (connectionError) {
        console.error('Error fetching connection data:', connectionError);
        throw connectionError;
      }

      if (!connectionData) {
        console.error('No connection found for item_id:', item_id);
        throw new Error('No connection found for item_id: ' + item_id);
      }

      console.log('Found connection data:', connectionData);

      // Sync transactions using the access token
      await syncTransactions(connectionData.access_token, connectionData.user_id);

      // Get the user's device tokens for notification
      const { data: tokens, error: tokensError } = await supabase
        .from('device_tokens')
        .select('token')
        .eq('user_id', connectionData.user_id);

      if (tokensError) {
        console.error('Error fetching device tokens:', tokensError);
        throw tokensError;
      }

      console.log('Found device tokens:', tokens);

      if (tokens && tokens.length > 0) {
        console.log('Sending push notification for tokens:', tokens.map(t => t.token));
        // Send push notification
        const notificationResponse = await supabase.functions.invoke('send-push-notification', {
          body: {
            tokens: tokens.map(t => t.token),
            title: 'New Transactions Available',
            body: `New transactions detected in your ${connectionData.institution_name} account`,
            data: {
              type: 'TRANSACTIONS_UPDATE',
              institution: connectionData.institution_name
            }
          }
        });

        console.log('Push notification response:', notificationResponse);
      } else {
        console.log('No device tokens found for user:', connectionData.user_id);
      }
    } else {
      console.log('Received non-transaction webhook or different webhook code:', webhookData.webhook_type, webhookData.webhook_code);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (error) {
    console.error('Error processing Plaid webhook:', error);
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
