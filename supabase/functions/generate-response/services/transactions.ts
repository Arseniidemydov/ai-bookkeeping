
import { SupabaseClient } from '@supabase/supabase-js';

export async function addExpenseTransaction(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string,
  category?: string
) {
  const { data, error } = await supabase
    .from('transactions')
    .insert([
      {
        user_id: userId,
        amount: -amount, // negative for expenses
        description,
        category,
        type: 'expense'
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addIncomeTransaction(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  description: string,
  category?: string
) {
  const { data, error } = await supabase
    .from('transactions')
    .insert([
      {
        user_id: userId,
        amount, // positive for income
        description,
        category,
        type: 'income'
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}
