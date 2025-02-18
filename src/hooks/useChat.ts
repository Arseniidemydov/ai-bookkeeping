import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Message {
  id: number;
  content: string;
  sender: "user" | "other";
  timestamp: string;
  file?: {
    url: string;
    type: string;
    name: string;
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // Increased to 2 seconds

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);

  const { data: chatHistory, isLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.user) {
        return [];
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('timestamp', { ascending: true });

      if (error) {
        toast.error("Failed to load chat history");
        throw error;
      }

      return data || [];
    },
  });

  const chatMutation = useMutation({
    mutationFn: async ({ message, fileUrl }: { message: string, fileUrl?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      let lastError;
      let retries = 0;

      while (retries < MAX_RETRIES) {
        try {
          console.log(`Attempt ${retries + 1} to send message...`);
          
          const response = await supabase.functions.invoke('generate-response', {
            body: { 
              prompt: message,
              userId: session.session.user.id,
              threadId: threadId,
              fileUrl: fileUrl
            },
          });

          if (response.error) {
            console.error('Error from generate-response:', response.error);
            throw response.error;
          }

          if (response.data.threadId && !threadId) {
            setThreadId(response.data.threadId);
          }

          return response.data.generatedText;
        } catch (error) {
          lastError = error;
          retries++;
          console.error(`Attempt ${retries} failed:`, error);
          
          if (retries === MAX_RETRIES) {
            toast.error("Failed to get response. Please try again.");
            throw new Error(`Failed to generate response after ${MAX_RETRIES} attempts: ${error.message}`);
          }
          
          // Wait before retrying with exponential backoff
          await delay(RETRY_DELAY * Math.pow(2, retries - 1));
        }
      }

      throw lastError;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (message: Omit<Message, 'id' | 'timestamp'>) => {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{
          content: message.content,
          sender: message.sender,
          user_id: session.session.user.id,
          thread_id: threadId,
          file_url: message.file?.url,
          file_type: message.file?.type,
          file_name: message.file?.name
        }])
        .select()
        .single();

      if (error) {
        console.error('Error saving message:', error);
        throw error;
      }
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('chat_files')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat_files')
        .getPublicUrl(fileName);

      return {
        url: publicUrl,
        type: file.type,
        name: file.name
      };
    },
  });

  const simulateWebhookMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await supabase.functions.invoke('simulate-plaid-webhook', {
        body: { item_id: itemId }
      });

      if (response.error) {
        console.error('Error simulating webhook:', response.error);
        toast.error("Failed to simulate webhook");
        throw response.error;
      }

      toast.success("Webhook simulation completed");
      return response.data;
    }
  });

  useEffect(() => {
    if (chatHistory) {
      const formattedMessages = chatHistory.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        timestamp: new Date(msg.timestamp).toLocaleTimeString([], { 
          hour: "2-digit", 
          minute: "2-digit" 
        }),
        file: msg.file_url ? {
          url: msg.file_url,
          type: msg.file_type,
          name: msg.file_name
        } : undefined
      }));
      setMessages(formattedMessages);
    }
  }, [chatHistory]);

  return {
    messages,
    setMessages,
    isLoading,
    chatMutation,
    saveMutation,
    uploadMutation,
    simulateWebhookMutation
  };
}
