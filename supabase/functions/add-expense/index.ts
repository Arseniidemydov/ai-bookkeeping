
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';
import { corsHeaders } from '../generate-response/utils/cors.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, amount, category, date } = await req.json();
    console.log('Adding expense:', { user_id, amount, category, date });

    // Validate required fields
    if (!user_id || !amount || !category || !date) {
      throw new Error('Missing required fields');
    }

    // Parse and validate date format (DD-MM-YYYY)
    const dateParts = date.split('-');
    if (dateParts.length !== 3) {
      throw new Error('Invalid date format. Expected DD-MM-YYYY');
    }
    const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`; // Convert to YYYY-MM-DD

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

    // Insert the expense into the transactions table
    const { data, error } = await supabaseClient
      .from('transactions')
      .insert([
        {
          user_id,
          amount,
          category,
          date: formattedDate,
          type: 'expense'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error inserting expense:', error);
      throw error;
    }

    console.log('Expense added successfully:', data);

    return new Response(
      JSON.stringify({
        success: true,
        data
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in add-expense:', error);
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
