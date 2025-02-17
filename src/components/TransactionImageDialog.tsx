
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TransactionImageDialogProps {
  documentPageId?: string | null;
}

export function TransactionImageDialog({ documentPageId }: TransactionImageDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleOpen = async () => {
    if (!documentPageId) return;

    try {
      const { data, error } = await supabase
        .from('document_pages')
        .select('image_url')
        .eq('id', documentPageId)
        .single();

      if (error) throw error;
      if (data?.image_url) {
        setImageUrl(data.image_url);
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching image:', error);
    }
  };

  if (!documentPageId) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        className="h-8 w-8"
      >
        <Image className="h-4 w-4" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Transaction attachment"
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
