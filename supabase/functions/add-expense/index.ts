
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';

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
    // Get request body
    const { amount, category, date, userId } = await req.json();
    console.log('Received expense data:', { amount, category, date, userId });

    // Validate required fields
    if (!amount || !category || !date || !userId) {
      throw new Error('Missing required fields: amount, category, date, and userId are required');
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Insert transaction
    const { data, error } = await supabaseClient
      .from('transactions')
      .insert([
        {
          user_id: userId,
          amount: -Math.abs(amount), // Ensure expense is stored as negative
          category,
          date,
          type: 'expense'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error inserting expense:', error);
      throw error;
    }

    console.log('Successfully added expense:', data);

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in add-expense function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
