
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "./chat/LoadingSpinner";

interface TransactionImageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: number | null;
}

export function TransactionImageDialog({
  isOpen,
  onClose,
  transactionId,
}: TransactionImageDialogProps) {
  const { data: documentPage, isLoading } = useQuery({
    queryKey: ['transaction-image', transactionId],
    queryFn: async () => {
      if (!transactionId) return null;
      
      const { data: transaction } = await supabase
        .from('transactions')
        .select('document_page_id')
        .eq('id', transactionId)
        .single();

      if (!transaction?.document_page_id) return null;

      const { data: page } = await supabase
        .from('document_pages')
        .select('image_url')
        .eq('id', transaction.document_page_id)
        .single();

      return page;
    },
    enabled: !!transactionId,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-gray-900 border-gray-800">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner />
          </div>
        ) : documentPage?.image_url ? (
          <div className="relative aspect-[4/3]">
            <img
              src={documentPage.image_url}
              alt="Transaction receipt"
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-white/60">
            No image attached to this transaction
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
