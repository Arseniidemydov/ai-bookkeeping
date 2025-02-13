
import { useState, useRef } from "react";
import { Send, PaperclipIcon, Mic, CirclePause } from "lucide-react";
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
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            
            const { data, error } = await supabase.functions.invoke('voice-to-text', {
              body: { audio: base64Audio }
            });

            if (error) {
              throw error;
            }

            if (data.text) {
              onSend(data.text);
            }
          };
          reader.readAsDataURL(audioBlob);
        } catch (error) {
          console.error('Error processing audio:', error);
          toast.error('Failed to process audio');
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      if ((error as Error).name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please enable it in your browser/device settings.');
      } else {
        toast.error('Failed to start recording');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
        setIsProcessingPdf(true);
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

          const { data: processedData, error: processError } = await supabase.functions.invoke('process-pdf', {
            body: { pdfUrl: publicUrl }
          });

          if (processError) throw processError;

          onSend(processedData.text);
        } catch (error) {
          console.error('Error handling PDF:', error);
          toast.error('Failed to process PDF');
        } finally {
          setIsProcessingPdf(false);
        }
      } else {
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
        disabled={isProcessingPdf || isRecording}
      >
        <PaperclipIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={isRecording ? stopRecording : startRecording}
        className="p-2.5 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
        disabled={isProcessingPdf}
      >
        {isRecording ? (
          <CirclePause className="w-5 h-5 text-red-500" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={isProcessingPdf ? "Processing PDF..." : selectedFile ? `${selectedFile.name} selected...` : "Message..."}
        className="flex-1 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
        disabled={isProcessingPdf || isRecording}
      />
      <button
        type="submit"
        className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isProcessingPdf || isRecording || (!message.trim() && !selectedFile)}
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
}
