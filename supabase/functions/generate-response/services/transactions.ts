
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

function formatDateToISO(dateStr: string): string {
  // If the date is already in ISO format (YYYY-MM-DD), return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('-').map(Number);
    // Create date in local timezone
    const date = new Date(year, month - 1, day);
    // Format to YYYY-MM-DD
    return date.toISOString().split('T')[0];
  }

  throw new Error(`Invalid date format: ${dateStr}. Expected DD-MM-YYYY or YYYY-MM-DD`);
}

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
    const formattedDate = formatDateToISO(date);
    console.log('Formatted date for income transaction:', formattedDate);

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
    const formattedDate = formatDateToISO(date);
    console.log('Formatted date for expense transaction:', formattedDate);

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
