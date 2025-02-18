
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { format, parse } from "https://deno.land/x/date_fns@v2.22.1/index.js";

export async function getTransactionsContext(supabase: any, userId: string) {
  if (!userId) {
    console.log('No user ID provided for transactions context');
    return '[]';
  }

  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    console.log('Successfully fetched transactions for user:', userId, 'count:', transactions?.length);
    return JSON.stringify(transactions || []);
  } catch (error) {
    console.error('Error in getTransactionsContext:', error);
    return '[]';
  }
}

export async function addIncomeTransaction(
  supabase: any, 
  userId: string, 
  amount: number, 
  source: string, 
  date: string,
  category: string
) {
  if (!userId) {
    throw new Error('User ID is required for adding income transaction');
  }

  try {
    // Parse the date string and format it to ISO
    let formattedDate = date;
    if (date.includes('-')) {
      // Handle DD-MM-YYYY format
      const parsedDate = parse(date, 'dd-MM-yyyy', new Date());
      formattedDate = format(parsedDate, 'yyyy-MM-dd');
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        amount: amount,
        type: 'income',
        description: source,
        category: category,
        date: formattedDate
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding income transaction:', error);
      throw error;
    }

    console.log('Successfully added income transaction:', data);
    return JSON.stringify(data);
  } catch (error) {
    console.error('Error in addIncomeTransaction:', error);
    throw error;
  }
}

export async function addExpenseTransaction(
  supabase: any, 
  userId: string, 
  amount: number, 
  category: string,
  date: string
) {
  if (!userId) {
    throw new Error('User ID is required for adding expense transaction');
  }

  try {
    // Parse the date string and format it to ISO
    let formattedDate = date;
    if (date.includes('-')) {
      // Handle DD-MM-YYYY format
      const parsedDate = parse(date, 'dd-MM-yyyy', new Date());
      formattedDate = format(parsedDate, 'yyyy-MM-dd');
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        amount: -Math.abs(amount), // Ensure expense is negative
        type: 'expense',
        description: category,
        category: category,
        date: formattedDate
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding expense transaction:', error);
      throw error;
    }

    console.log('Successfully added expense transaction:', data);
    return JSON.stringify(data);
  } catch (error) {
    console.error('Error in addExpenseTransaction:', error);
    throw error;
  }
}
