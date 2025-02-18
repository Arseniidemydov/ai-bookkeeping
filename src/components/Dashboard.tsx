import { useState, useEffect } from "react";
import { Maximize2, Minimize2, LogOut, Trash2, Image, ChevronDown, ChevronUp, CreditCard, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { subDays, subMonths, startOfDay, endOfDay, format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { TransactionImageDialog } from "./TransactionImageDialog";
import { PlaidLinkButton } from "./PlaidLinkButton";
import { Bell } from "lucide-react";

type TimePeriod = 'day' | 'week' | 'month' | '3months' | '6months' | 'all';
interface Transaction {
  id: number;
  amount: number;
  category: string;
  date: string;
  type: 'income' | 'expense';
  description?: string;
}
interface FinancialMetric {
  label: string;
  value: number;
  type: 'income' | 'expense' | 'tax' | 'net';
  transactions?: Transaction[];
}

interface GroupedTransactions {
  month: string;
  transactions: Transaction[];
  isExpanded: boolean;
}

export function Dashboard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [isTransactionsOpen, setIsTransactionsOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [selectedImageTransaction, setSelectedImageTransaction] = useState<number | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [groupedTransactions, setGroupedTransactions] = useState<GroupedTransactions[]>([]);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const getDateRange = (period: TimePeriod) => {
    const now = new Date();
    switch (period) {
      case 'day':
        return {
          start: startOfDay(now),
          end: endOfDay(now)
        };
      case 'week':
        return {
          start: subDays(now, 7),
          end: now
        };
      case 'month':
        return {
          start: subDays(now, 30),
          end: now
        };
      case '3months':
        return {
          start: subMonths(now, 3),
          end: now
        };
      case '6months':
        return {
          start: subMonths(now, 6),
          end: now
        };
      default:
        return null;
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to log out');
      console.error('Error logging out:', error);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error('No user session found');
        return;
      }

      const tables = ['transactions', 'plaid_connections', 'device_tokens', 'chat_messages'];
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('user_id', session.session.user.id);
        
        if (error) {
          console.error(`Error deleting from ${table}:`, error);
        }
      }

      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        session.session.user.id
      );

      if (deleteError) throw deleteError;

      await supabase.auth.signOut();
      navigate('/auth');
      toast.success('Account deleted successfully');
    } catch (error) {
      toast.error('Failed to delete account');
      console.error('Error deleting account:', error);
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    try {
      const {
        error
      } = await supabase.from('transactions').delete().eq('id', transactionId);
      if (error) throw error;
      toast.success('Transaction deleted successfully');
      setSelectedTransactions(prev => prev.filter(t => t.id !== transactionId));
      refetch();
    } catch (error) {
      toast.error('Failed to delete transaction');
      console.error('Error deleting transaction:', error);
    }
  };

  const createTestTransaction = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error('You must be logged in to create a transaction');
        return;
      }

      const { error } = await supabase.from('transactions').insert({
        amount: 100,
        type: 'income',
        category: 'Test',
        date: new Date().toISOString(),
        description: 'Test transaction for push notification',
        user_id: session.session.user.id
      });

      if (error) throw error;
      toast.success('Test transaction created! Check for push notification.');
      refetch();
    } catch (error) {
      console.error('Error creating test transaction:', error);
      toast.error('Failed to create test transaction');
    }
  };

  const sendTestNotification = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error('You must be logged in to send notifications');
        return;
      }

      console.log('Starting test notification request...');
      console.log('User ID:', session.session.user.id);

      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: session.session.user.id,
          title: 'Test Notification',
          body: 'This is a test notification',
          timestamp: new Date().toISOString()
        },
      });

      console.log('Response:', { data, error });

      if (error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          context: error
        });
        toast.error('Failed to send test notification');
        return;
      }

      toast.success('Test notification sent successfully!');
    } catch (error) {
      console.error('Caught error:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      toast.error('Failed to send test notification');
    }
  };

  const {
    data: financialData,
    refetch
  } = useQuery({
    queryKey: ['financial-metrics', selectedPeriod],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return null;

      let query = supabase.from('transactions').select('*').eq('user_id', session.session.user.id);
      const dateRange = getDateRange(selectedPeriod);
      if (dateRange) {
        query = query.gte('date', dateRange.start.toISOString()).lte('date', dateRange.end.toISOString());
      }

      const { data: transactions, error } = await query;
      if (error) throw error;

      const incomeTransactions = transactions?.filter(t => t.type === 'income') || [];
      const expenseTransactions = transactions?.filter(t => t.type === 'expense') || [];

      const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const profitBeforeTax = totalIncome - Math.abs(totalExpenses);
      const estimatedTax = profitBeforeTax > 0 ? profitBeforeTax * 0.25 : 0;
      const netIncome = profitBeforeTax - estimatedTax;

      return [{
        label: "Total Income",
        value: totalIncome,
        type: 'income',
        transactions: incomeTransactions
      }, {
        label: "Total Expenses",
        value: Math.abs(totalExpenses),
        type: 'expense',
        transactions: expenseTransactions
      }, {
        label: "Estimated Tax (25%)",
        value: estimatedTax,
        type: 'tax'
      }, {
        label: "Net Income",
        value: netIncome,
        type: 'net'
      }] as FinancialMetric[];
    }
  });

  const { data: plaidConnections } = useQuery({
    queryKey: ['plaid-connections'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return [];

      const { data, error } = await supabase
        .from('plaid_connections')
        .select('*')
        .eq('user_id', session.session.user.id);

      if (error) throw error;
      return data || [];
    }
  });

  useEffect(() => {
    const channel = supabase.channel('transactions-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transactions'
    }, () => {
      console.log('Transaction changed, refetching data...');
      refetch();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const timePeriods: {
    label: string;
    value: TimePeriod;
  }[] = [{
    label: 'Day',
    value: 'day'
  }, {
    label: 'Week',
    value: 'week'
  }, {
    label: 'Month',
    value: 'month'
  }, {
    label: '3 Months',
    value: '3months'
  }, {
    label: '6 Months',
    value: '6months'
  }, {
    label: 'All Time',
    value: 'all'
  }];

  const visibleMetrics = isMobile && !isExpanded ? financialData?.slice(0, 2) : financialData;
  const handleMetricClick = (metric: FinancialMetric) => {
    if (metric.type === 'income' || metric.type === 'expense') {
      setTransactionType(metric.type);
      setSelectedTransactions(metric.transactions || []);
      setIsTransactionsOpen(true);
    }
  };

  useEffect(() => {
    if (selectedTransactions.length > 0) {
      const grouped = selectedTransactions.reduce((acc: GroupedTransactions[], transaction) => {
        const monthKey = format(parseISO(transaction.date), 'MMMM yyyy');
        const existingGroup = acc.find(g => g.month === monthKey);
        
        if (existingGroup) {
          existingGroup.transactions.push(transaction);
        } else {
          acc.push({
            month: monthKey,
            transactions: [transaction],
            isExpanded: true
          });
        }
        
        return acc;
      }, []);

      grouped.forEach(group => {
        group.transactions.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      });

      grouped.sort((a, b) => 
        new Date(b.transactions[0].date).getTime() - 
        new Date(a.transactions[0].date).getTime()
      );

      setGroupedTransactions(grouped);
    }
  }, [selectedTransactions]);

  const toggleMonthExpansion = (monthKey: string) => {
    setGroupedTransactions(prev => 
      prev.map(group => 
        group.month === monthKey 
          ? { ...group, isExpanded: !group.isExpanded }
          : group
      )
    );
  };

  return <div className={cn("fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 transition-all duration-300 ease-in-out", isExpanded ? "h-screen" : "h-64")}>
    <div className="p-4 h-full overflow-y-auto relative flex flex-col py-[22px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-white">Financial Overview</h2>
        <button onClick={() => setIsExpanded(!isExpanded)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          {isExpanded ? <Minimize2 className="w-5 h-5 text-white/80" /> : <Maximize2 className="w-5 h-5 text-white/80" />}
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {timePeriods.map(period => <button key={period.value} onClick={() => setSelectedPeriod(period.value)} className={cn("px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors", selectedPeriod === period.value ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10")}>
            {period.label}
          </button>)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {visibleMetrics?.map(metric => <div key={metric.label} onClick={() => handleMetricClick(metric)} className={cn("p-4 rounded-2xl backdrop-blur-sm border transition-all duration-300 h-auto cursor-pointer hover:opacity-80", metric.type === 'income' && "bg-emerald-950/30 border-emerald-800/50", metric.type === 'expense' && "bg-rose-950/30 border-rose-800/50", metric.type === 'tax' && "bg-amber-950/30 border-amber-800/50", metric.type === 'net' && "bg-blue-950/30 border-blue-800/50")}>
            <p className="text-sm font-medium text-white/60 mb-2">{metric.label}</p>
            <p className={cn("text-lg font-semibold", metric.type === 'income' && "text-emerald-400", metric.type === 'expense' && "text-rose-400", metric.type === 'tax' && "text-amber-400", metric.type === 'net' && "text-blue-400")}>
              {formatCurrency(metric.value)}
            </p>
          </div>)}
      </div>

      {isExpanded && (
        <>
          {plaidConnections && plaidConnections.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-sm font-medium text-white/60 mb-2">Connected Bank Accounts</h3>
              <div className="grid gap-2">
                {plaidConnections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center gap-2 p-3 bg-white/5 rounded-lg"
                  >
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    <span className="text-white">
                      {connection.institution_name || 'Connected Bank Account'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 flex flex-col md:flex-row justify-center gap-4">
            <PlaidLinkButton />
            <Button 
              variant="outline"
              onClick={sendTestNotification}
              className="w-full max-w-[200px] flex items-center justify-center gap-2"
            >
              <Bell className="h-4 w-4" />
              Test Notification
            </Button>
            <Button 
              variant="outline" 
              onClick={handleLogout} 
              className="w-full max-w-[200px] flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="w-full max-w-[200px] flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-gray-900 border-gray-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                  <AlertDialogDescription className="text-gray-400">
                    <div className="flex flex-col gap-2">
                      <p>Are you absolutely sure you want to delete your account? This action cannot be undone.</p>
                      <div className="flex items-start gap-2 p-3 bg-red-950/50 border border-red-900/50 rounded-lg mt-2">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-200">
                          <p className="font-medium mb-1">This will:</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>Delete all your transactions</li>
                            <li>Remove all bank connections</li>
                            <li>Delete all your chat messages</li>
                            <li>Permanently delete your account</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-800 text-white hover:bg-gray-700">Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAccount}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>

    <Dialog open={isTransactionsOpen} onOpenChange={setIsTransactionsOpen}>
      <DialogContent className="sm:max-w-[800px] bg-gray-900/95 backdrop-blur-xl border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">{transactionType === 'income' ? 'Income' : 'Expense'} Transactions</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {groupedTransactions.map(group => (
            <div key={group.month} className="mb-4">
              <button
                onClick={() => toggleMonthExpansion(group.month)}
                className="w-full flex items-center justify-between p-3 bg-gray-800/50 rounded-lg mb-2 hover:bg-gray-800/70 transition-colors"
              >
                <span className="font-medium text-white">{group.month}</span>
                {group.isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              
              {group.isExpanded && group.transactions.map(transaction => (
                <div key={transaction.id} 
                     className="flex items-center justify-between p-4 mb-2 bg-gray-800/30 rounded-lg border border-gray-700/50 hover:bg-gray-800/50 transition-all">
                  <div className="flex-1">
                    <p className="font-medium text-white">{transaction.category}</p>
                    <p className="text-sm text-gray-400">
                      {format(new Date(transaction.date), 'MMM dd, yyyy')}
                    </p>
                    {transaction.description && (
                      <p className="text-sm text-gray-500 mt-1">{transaction.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold", 
                      transactionType === 'income' ? "text-emerald-400" : "text-rose-400")}>
                      {formatCurrency(transaction.amount)}
                    </span>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-gray-700/50"
                      onClick={() => {
                        setSelectedImageTransaction(transaction.id);
                        setIsImageDialogOpen(true);
                      }}
                    >
                      <Image className="h-4 w-4 text-gray-400" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 hover:bg-gray-700/50"
                        >
                          <Trash2 className="h-4 w-4 text-gray-400" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-gray-900 border-gray-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">Delete Transaction</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this transaction? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-gray-800 text-white hover:bg-gray-700">Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteTransaction(transaction.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {selectedTransactions.length === 0 && (
            <p className="text-center text-gray-400 py-4">No transactions found</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <TransactionImageDialog
      isOpen={isImageDialogOpen}
      onClose={() => {
        setIsImageDialogOpen(false);
        setSelectedImageTransaction(null);
      }}
      transactionId={selectedImageTransaction}
    />
  </div>;
}
