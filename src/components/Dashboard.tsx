
import { useState, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { subDays, subMonths, startOfDay, endOfDay } from "date-fns";

type TimePeriod = 'day' | 'week' | 'month' | '3months' | '6months' | 'all';

interface FinancialMetric {
  label: string;
  value: number;
  type: 'income' | 'expense' | 'tax' | 'net';
}

export function Dashboard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');
  const isMobile = useIsMobile();

  const getDateRange = (period: TimePeriod) => {
    const now = new Date();
    switch (period) {
      case 'day':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: subDays(now, 7), end: now };
      case 'month':
        return { start: subDays(now, 30), end: now };
      case '3months':
        return { start: subMonths(now, 3), end: now };
      case '6months':
        return { start: subMonths(now, 6), end: now };
      default:
        return null; // No date filtering for 'all'
    }
  };

  const { data: financialData, refetch } = useQuery({
    queryKey: ['financial-metrics', selectedPeriod],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return null;

      let query = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.session.user.id);

      const dateRange = getDateRange(selectedPeriod);
      if (dateRange) {
        query = query
          .gte('date', dateRange.start.toISOString())
          .lte('date', dateRange.end.toISOString());
      }

      const { data: transactions, error } = await query;
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

  const timePeriods: { label: string; value: TimePeriod }[] = [
    { label: 'Day', value: 'day' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
    { label: '3 Months', value: '3months' },
    { label: '6 Months', value: '6months' },
    { label: 'All Time', value: 'all' },
  ];

  const visibleMetrics = isMobile && !isExpanded
    ? financialData?.slice(0, 2)
    : financialData;

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

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {timePeriods.map(period => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              className={cn(
                "px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors",
                selectedPeriod === period.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              )}
            >
              {period.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {visibleMetrics?.map((metric) => (
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
