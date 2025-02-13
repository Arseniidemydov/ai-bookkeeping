import { useState, useRef } from "react";
import { Send, PaperclipIcon, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() || selectedFile) {
      onSend(message, selectedFile || undefined);
      setMessage("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const processPdfDocument = async (file: File, fileUrl: string) => {
    try {
      setIsProcessingPdf(true);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: session.session.user.id,
          original_name: file.name,
          file_url: fileUrl,
          status: 'pending'
        })
        .select()
        .single();

      if (docError) throw docError;

      const { error: processError } = await supabase.functions
        .invoke('process-pdf', {
          body: { documentId: document.id, fileUrl }
        });

      if (processError) throw processError;

      let processingComplete = false;
      let attempts = 0;
      const maxAttempts = 30;
      
      while (!processingComplete && attempts < maxAttempts) {
        const { data: updatedDoc, error: checkError } = await supabase
          .from('documents')
          .select('status')
          .eq('id', document.id)
          .single();
        
        if (checkError) throw checkError;
        
        if (updatedDoc.status === 'completed') {
          processingComplete = true;
        } else if (updatedDoc.status === 'error') {
          throw new Error('Failed to process PDF');
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
      }

      if (!processingComplete) {
        throw new Error('PDF processing timed out');
      }

      const { data: pages, error: pagesError } = await supabase
        .from('document_pages')
        .select('*')
        .eq('document_id', document.id)
        .order('page_number');

      if (pagesError) throw pagesError;

      const pagesContext = pages.map(page => page.image_url).join('\n');
      const newMessage = `I've uploaded a PDF document (${file.name}) for analysis. Here are the processed pages:\n${pagesContext}`;
      setMessage(newMessage);
      
      // Automatically send the message once PDF is processed
      onSend(newMessage);
      setMessage("");
      
    } catch (error) {
      console.error('Error processing PDF:', error);
      toast.error('Failed to process PDF');
      throw error;
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Only images (JPEG, PNG, GIF) and PDF files are allowed");
        return;
      }

      if (file.type === 'application/pdf') {
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pdf_pages')
            .upload(`original/${fileName}`, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('pdf_pages')
            .getPublicUrl(`original/${fileName}`);

          await processPdfDocument(file, publicUrl);
        } catch (error) {
          console.error('Error handling PDF:', error);
          toast.error('Failed to process PDF');
        }
      } else {
        // For images, just set the file and let the user send it
        setSelectedFile(file);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#101010] border-t border-white/10">
      <div className="w-full flex justify-center p-2 border-b border-white/10">
        <Button 
          variant="destructive" 
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </Button>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,.pdf"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
          disabled={isProcessingPdf}
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={isProcessingPdf ? "Processing PDF..." : selectedFile ? `${selectedFile.name} selected...` : "Message..."}
          className="flex-1 px-4 py-2.5 rounded-full bg-[#1E1E1E] border border-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4285F4]/50 focus:border-transparent"
          disabled={isProcessingPdf}
        />
        <button
          type="submit"
          className="p-2.5 rounded-full bg-[#4285F4] text-white hover:bg-[#4285F4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isProcessingPdf || (!message.trim() && !selectedFile)}
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
