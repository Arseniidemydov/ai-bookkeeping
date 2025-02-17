
import { useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('transaction_attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from('transaction_attachments')
        .getPublicUrl(fileName);

      // Create a document page entry
      const { data: pageData, error: pageError } = await supabase
        .from('document_pages')
        .insert([{
          image_url: publicUrl,
          page_number: 1,
          document_id: null
        }])
        .select()
        .single();

      if (pageError) throw pageError;

      // Update transaction with document page reference
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ document_page_id: pageData.id })
        .eq('id', transactions.id);

      if (updateError) throw updateError;

      toast.success("Image attached successfully");
      onSuccess?.();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error("Failed to attach image");
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
          variant="outline"
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
          variant="outline"
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
