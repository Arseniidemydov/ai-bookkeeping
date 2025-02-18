
import { useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TransactionImageUploadProps {
  onFileSelect: (file: File) => void;
}

export function TransactionImageUpload({ onFileSelect }: TransactionImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (file: File) => {
    try {
      setIsUploading(true);
      onFileSelect(file);
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
    <div className="flex flex-col gap-2 mt-2">
      <p className="text-sm text-white/80">Would you like to attach picture?</p>
      <div className="flex gap-2">
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
            className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white rounded-xl shadow-lg transition-all duration-300 hover:scale-105 border border-white/10"
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
            className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white rounded-xl shadow-lg transition-all duration-300 hover:scale-105 border border-white/10"
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
    </div>
  );
}
