
import { useState, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface FinancialMetric {
  label: string;
  value: number;
  type: 'income' | 'expense' | 'tax' | 'net';
}

export function Dashboard() {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: financialData, refetch } = useQuery({
    queryKey: ['financial-metrics'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return null;

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.session.user.id);

      if (error) throw error;

      const totalIncome = transactions
        ?.filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      const totalExpenses = transactions
        ?.filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      const estimatedTax = totalIncome * 0.3;
      const netIncome = totalIncome - totalExpenses - estimatedTax;

      return [
        { label: "Total Income", value: totalIncome, type: 'income' },
        { label: "Total Expenses", value: totalExpenses, type: 'expense' },
        { label: "Estimated Tax (30%)", value: estimatedTax, type: 'tax' },
        { label: "Net Income", value: netIncome, type: 'net' },
      ] as FinancialMetric[];
    },
  });

  // Subscribe to changes in the transactions table
  useEffect(() => {
    const channel = supabase
      .channel('table-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-xl border-b border-white/10 transition-all duration-300 ease-in-out",
        isExpanded ? "h-screen" : "h-48"
      )}
    >
      <div className="p-4 h-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-white">Financial Overview</h2>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            {isExpanded ? (
              <Minimize2 className="w-5 h-5 text-white/80" />
            ) : (
              <Maximize2 className="w-5 h-5 text-white/80" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {financialData?.map((metric) => (
            <div
              key={metric.label}
              className={cn(
                "p-4 rounded-2xl backdrop-blur-sm border transition-all duration-300",
                metric.type === 'income' && "bg-emerald-950/30 border-emerald-800/50",
                metric.type === 'expense' && "bg-rose-950/30 border-rose-800/50",
                metric.type === 'tax' && "bg-amber-950/30 border-amber-800/50",
                metric.type === 'net' && "bg-blue-950/30 border-blue-800/50"
              )}
            >
              <p className="text-sm font-medium text-white/60">{metric.label}</p>
              <p className={cn(
                "text-lg font-semibold mt-1",
                metric.type === 'income' && "text-emerald-400",
                metric.type === 'expense' && "text-rose-400",
                metric.type === 'tax' && "text-amber-400",
                metric.type === 'net' && "text-blue-400"
              )}>
                {formatCurrency(metric.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
