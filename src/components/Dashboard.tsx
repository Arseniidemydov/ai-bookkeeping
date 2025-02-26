import { useState, useEffect } from "react";
import { Maximize2, Minimize2, LogOut, Trash2, Image, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
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
  const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
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
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleDeleteAccount = async () => {
    try {
      const { error: deletionError } = await supabase.rpc('delete_user');
      if (deletionError) throw deletionError;
      
      await supabase.auth.signOut();
      navigate('/auth');
      toast.success('Account deleted successfully');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account');
    }
  };

  const handleConnectBank = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase.functions.invoke('create-link-token', {
        body: { user_id: user.id }
      });

      if (error) throw error;
      if (!data?.link_token) throw new Error('No link token received');

      const handler = window.Plaid.create({
        token: data.link_token,
        onSuccess: async (public_token: string) => {
          const { error: exchangeError } = await supabase.functions.invoke('exchange-public-token', {
            body: { public_token, user_id: user.id }
          });
          
          if (exchangeError) {
            toast.error('Failed to connect bank account');
            return;
          }
          
          toast.success('Bank account connected successfully');
          refetch();
        },
        onExit: () => {
          toast.error('Bank connection cancelled');
        },
      });
      
      handler.open();
    } catch (error) {
      console.error('Error connecting bank:', error);
      toast.error('Failed to initialize bank connection');
    }
  };

  const { data: connectedBanks } = useQuery({
    queryKey: ['connected-banks'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: connections, error } = await supabase
        .from('plaid_connections')
        .select('*');

      if (error) throw error;
      return connections || [];
    }
  });

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
        transactions: incomeTransactions as Transaction[]
      }, {
        label: "Total Expenses",
        value: Math.abs(totalExpenses),
        type: 'expense',
        transactions: expenseTransactions as Transaction[]
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
          <div className="mt-6 border-t border-white/10 pt-6">
            <h3 className="text-white/80 text-sm font-medium mb-4">Connected Bank Accounts</h3>
            
            {connectedBanks && connectedBanks.length > 0 ? (
              <div className="space-y-3">
                {connectedBanks.map((bank) => (
                  <div 
                    key={bank.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-white/60" />
                      <span className="text-white/80">{bank.institution_name}</span>
                    </div>
                    <span className="text-emerald-400 text-sm">Connected</span>
                  </div>
                ))}
              </div>
            ) : (
              <Button 
                onClick={handleConnectBank}
                className="w-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Connect Bank Account
              </Button>
            )}
          </div>

          <div className="mt-auto pt-4 space-y-3">
            <Button 
              variant="ghost" 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 text-white/60 hover:text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </Button>

            <AlertDialog open={isDeleteAccountDialogOpen} onOpenChange={setIsDeleteAccountDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost"
                  className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-gray-900 border-gray-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete Account</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-gray-800 text-white hover:bg-gray-700">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
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
