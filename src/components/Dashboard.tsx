
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

  const { data: financialData } = useQuery({
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-gray-900 backdrop-blur-lg border-b border-gray-800 transition-all duration-300 ease-in-out",
        isExpanded ? "h-screen" : "h-48"
      )}
    >
      <div className="p-4 h-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Financial Overview</h2>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            {isExpanded ? (
              <Minimize2 className="w-5 h-5 text-gray-300" />
            ) : (
              <Maximize2 className="w-5 h-5 text-gray-300" />
            )}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {financialData?.map((metric) => (
            <div
              key={metric.label}
              className={cn(
                "p-4 rounded-lg backdrop-blur-sm border",
                metric.type === 'income' && "bg-green-950/50 border-green-800",
                metric.type === 'expense' && "bg-red-950/50 border-red-800",
                metric.type === 'tax' && "bg-yellow-950/50 border-yellow-800",
                metric.type === 'net' && "bg-blue-950/50 border-blue-800"
              )}
            >
              <p className="text-sm text-gray-400">{metric.label}</p>
              <p className={cn(
                "text-lg font-semibold mt-1",
                metric.type === 'income' && "text-green-400",
                metric.type === 'expense' && "text-red-400",
                metric.type === 'tax' && "text-yellow-400",
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
