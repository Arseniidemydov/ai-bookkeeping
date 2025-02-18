
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';

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
    // Ensure date is in YYYY-MM-DD format
    const formattedDate = formatDate(date);
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
    // Ensure date is in YYYY-MM-DD format
    const formattedDate = formatDate(date);
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

// Helper function to format dates consistently
function formatDate(dateStr: string): string {
  try {
    // Handle different date formats
    let date: Date;
    
    // Check if date is in DD-MM-YYYY format
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [day, month, year] = dateStr.split('-');
      date = new Date(`${year}-${month}-${day}`);
    }
    // Check if date is in YYYY-MM-DD format
    else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      date = new Date(dateStr);
    }
    // Try to parse as a regular date string
    else {
      date = new Date(dateStr);
    }

    // Validate the date
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }

    // Format to YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    throw new Error(`Invalid date format: ${dateStr}. Please use YYYY-MM-DD format.`);
  }
}
