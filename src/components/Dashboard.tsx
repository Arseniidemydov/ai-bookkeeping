import { useState, useEffect } from "react";
import { Maximize2, Minimize2, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { subDays, subMonths, startOfDay, endOfDay, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
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
export function Dashboard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [isTransactionsOpen, setIsTransactionsOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
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
      const {
        data: session
      } = await supabase.auth.getSession();
      if (!session?.session?.user) return null;
      let query = supabase.from('transactions').select('*').eq('user_id', session.session.user.id);
      const dateRange = getDateRange(selectedPeriod);
      if (dateRange) {
        query = query.gte('date', dateRange.start.toISOString()).lte('date', dateRange.end.toISOString());
      }
      const {
        data: transactions,
        error
      } = await query;
      if (error) throw error;
      const incomeTransactions = transactions?.filter(t => t.type === 'income') || [];
      const expenseTransactions = transactions?.filter(t => t.type === 'expense') || [];
      const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const estimatedTax = (totalIncome - totalExpenses) * 0.25; // Updated tax calculation
      const netIncome = totalIncome - totalExpenses - estimatedTax;
      return [{
        label: "Total Income",
        value: totalIncome,
        type: 'income',
        transactions: incomeTransactions
      }, {
        label: "Total Expenses",
        value: totalExpenses,
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

        {isExpanded && <div className="mt-auto pt-4 flex justify-center">
            <Button variant="destructive" onClick={handleLogout} className="w-full max-w-[200px] flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" />
              Log out
            </Button>
          </div>}
      </div>

      <Dialog open={isTransactionsOpen} onOpenChange={setIsTransactionsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{transactionType === 'income' ? 'Income' : 'Expense'} Transactions</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {selectedTransactions.map(transaction => <div key={transaction.id} className="flex items-center justify-between p-4 border-b border-gray-200 last:border-0">
                <div className="flex-1">
                  <p className="font-medium">{transaction.category}</p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(transaction.date), 'MMM dd, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn("font-semibold", transactionType === 'income' ? "text-emerald-600" : "text-rose-600")}>
                    {formatCurrency(transaction.amount)}
                  </span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-gray-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this transaction? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteTransaction(transaction.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>)}
            {selectedTransactions.length === 0 && <p className="text-center text-gray-500 py-4">No transactions found</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}