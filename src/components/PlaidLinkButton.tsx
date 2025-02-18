
import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOptions } from 'react-plaid-link';
import { Button } from "@/components/ui/button";
import { Link, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Query to check if user has any connected banks
  const { data: hasConnectedBank } = useQuery({
    queryKey: ['plaid-connection-status'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return false;

      const { data, error } = await supabase
        .from('plaid_connections')
        .select('id')
        .eq('user_id', session.session.user.id)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0;
    }
  });

  const generateToken = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error("Please sign in to connect your bank account");
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-plaid-link-token', {
        body: { user_id: session.session.user.id }
      });

      if (error) throw error;
      setLinkToken(data.link_token);
    } catch (error) {
      console.error('Error generating link token:', error);
      toast.error("Failed to initiate bank connection");
    }
  };

  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error("Please sign in to complete bank connection");
        return;
      }

      const { data, error: exchangeError } = await supabase.functions.invoke('exchange-plaid-token', {
        body: { 
          public_token,
          user_id: session.session.user.id,
          metadata
        }
      });

      if (exchangeError) throw exchangeError;

      toast.success(`Successfully connected to ${metadata.institution.name}`);
      setLinkToken(null);
    } catch (error) {
      console.error('Error saving plaid connection:', error);
      toast.error("Failed to save bank connection");
    }
  }, []);

  const onExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit,
  };

  const { open, ready } = usePlaidLink(config);

  const handleClick = async () => {
    if (linkToken) {
      open();
    } else {
      await generateToken();
    }
  };

  return (
    <Button 
      variant={hasConnectedBank ? "outline" : "default"}
      onClick={handleClick}
      disabled={(linkToken && !ready) || hasConnectedBank}
      className={`w-full max-w-[200px] flex items-center justify-center gap-2 ${
        hasConnectedBank 
          ? 'bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 border-emerald-500/20' 
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {hasConnectedBank ? (
        <>
          <CheckCircle2 className="w-4 h-4" />
          Bank Connected
        </>
      ) : (
        <>
          <Link className="w-4 h-4" />
          Connect Bank Account
        </>
      )}
    </Button>
  );
}
