
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { user_id, start_date, end_date, category } = await req.json();
    console.log('Fetching transactions for user:', user_id, 'with filters:', { start_date, end_date, category });

    if (!user_id) {
      throw new Error('user_id is required');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user_id)
      .order('date', { ascending: false });

    // Apply optional filters
    if (start_date) {
      query = query.gte('date', start_date);
      console.log('Applied start_date filter:', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
      console.log('Applied end_date filter:', end_date);
    }
    if (category) {
      query = query.eq('category', category);
      console.log('Applied category filter:', category);
    }

    const { data: transactions, error } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    console.log('Successfully fetched transactions:', transactions?.length);
    console.log('Sample of transactions data:', transactions?.slice(0, 2));

    return new Response(JSON.stringify({ transactions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-user-transactions function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
