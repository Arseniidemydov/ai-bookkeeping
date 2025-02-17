
import { useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { attachImageToTransaction } from "@/utils/transactionUtils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TransactionImageUploadProps {
  onSuccess?: () => void;
}

export function TransactionImageUpload({ onSuccess }: TransactionImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (file: File) => {
    try {
      setIsUploading(true);

      // Get the most recent transaction for the current user
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error("Please sign in to upload images");
        return;
      }

      const { data: transactions, error: fetchError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', session.session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;

      const result = await attachImageToTransaction(transactions.id, file);
      if (!result.success) throw new Error(result.error);

      toast.success("Image attached to transaction successfully");
      onSuccess?.();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error("Failed to attach image to transaction");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  return (
    <div className="flex gap-2 mt-2">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        id="camera-input"
      />
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        id="gallery-input"
      />
      <label htmlFor="camera-input">
        <Button
          variant="secondary"
          size="sm"
          className="cursor-pointer"
          disabled={isUploading}
          asChild
        >
          <span>
            <Camera className="w-4 h-4 mr-2" />
            Take Photo
          </span>
        </Button>
      </label>
      <label htmlFor="gallery-input">
        <Button
          variant="secondary"
          size="sm"
          className="cursor-pointer"
          disabled={isUploading}
          asChild
        >
          <span>
            <ImagePlus className="w-4 h-4 mr-2" />
            Choose Image
          </span>
        </Button>
      </label>
    </div>
  );
}
