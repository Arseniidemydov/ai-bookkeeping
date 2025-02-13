
import { useState, useRef } from "react";
import { Send, PaperclipIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);

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
      
      // Create document record
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

      // Call the process-pdf function
      const { error: processError } = await supabase.functions
        .invoke('process-pdf', {
          body: { documentId: document.id, fileUrl }
        });

      if (processError) throw processError;

      // Wait for document processing to complete
      let processingComplete = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout
      
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

      // Get all processed pages
      const { data: pages, error: pagesError } = await supabase
        .from('document_pages')
        .select('*')
        .eq('document_id', document.id)
        .order('page_number');

      if (pagesError) throw pagesError;

      // Set message with document ID and pages context
      const pagesContext = pages.map(page => page.image_url).join('\n');
      setMessage(`I've uploaded a PDF document (${file.name}) for analysis. Here are the processed pages:\n${pagesContext}`);
      
      toast.success('PDF processed successfully');
      return document.id;
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
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
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
          // Upload PDF to storage first
          const fileExt = file.name.split('.').pop();
          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pdf_pages')
            .upload(`original/${fileName}`, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('pdf_pages')
            .getPublicUrl(`original/${fileName}`);

          // Process the PDF
          await processPdfDocument(file, publicUrl);
        } catch (error) {
          console.error('Error handling PDF:', error);
          toast.error('Failed to process PDF');
        }
      } else {
        // Handle regular image files
        setSelectedFile(file);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 bg-[#222222] border-t border-white/10">
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
        className="flex-1 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
        disabled={isProcessingPdf}
      />
      <button
        type="submit"
        className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        disabled={isProcessingPdf}
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
}
