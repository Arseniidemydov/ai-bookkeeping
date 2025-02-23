
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

function formatDate(dateStr: string): string {
  // Handle date format dd.mm.yyyy or dd․mm․yyyy (with mid-dots)
  if (dateStr.includes('.') || dateStr.includes('․')) {
    const parts = dateStr.split(/[.․]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return dateStr; // Return as-is if it's already in YYYY-MM-DD format
}

export async function getTransactionsContext(supabase: SupabaseClient, userId: string) {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }

  return transactions || [];
}

export async function addIncomeTransaction(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  source: string,
  date?: string,
  category?: string
) {
  console.log('Adding income transaction:', { userId, amount, source, date, category });

  // Ensure amount is positive
  const positiveAmount = Math.abs(amount);

  // Format date if provided, otherwise use current date
  const transactionDate = date ? formatDate(date) : new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: positiveAmount,
      description: source,
      date: transactionDate,
      category: category || 'Income',
      type: 'income'
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding income transaction:', error);
    throw error;
  }

  console.log('Successfully added income transaction:', data);
  return data;
}

export async function addExpenseTransaction(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  category: string,
  date?: string
) {
  console.log('Adding expense transaction:', { userId, amount, category, date });

  // Ensure amount is negative for expenses
  const negativeAmount = -Math.abs(amount);

  // Format date if provided, otherwise use current date
  const transactionDate = date ? formatDate(date) : new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: negativeAmount,
      category,
      date: transactionDate,
      type: 'expense'
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding expense transaction:', error);
    throw error;
  }

  console.log('Successfully added expense transaction:', data);
  return data;
}
