
import { useState, useEffect, useRef } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationStarters } from "@/components/ConversationStarters";
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

export const ChatContainer = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const chatMutation = useMutation({
    mutationFn: async ({ message, fileUrl }: { message: string, fileUrl?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: { 
          prompt: message,
          userId: session.session.user.id,
          threadId: threadId,
          fileUrl: fileUrl
        },
      });

      if (error) {
        throw new Error("Failed to generate response");
      }

      if (data.threadId && !threadId) {
        setThreadId(data.threadId);
      }

      return data.generatedText;
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

      if (error) throw error;
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

  const handleSendMessage = async (content: string, file?: File) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error("Please sign in to send messages");
        return;
      }

      let fileData;
      if (file) {
        fileData = await uploadMutation.mutateAsync(file);
      }

      const savedUserMessage = await saveMutation.mutateAsync({
        content,
        sender: "user",
        file: fileData
      });

      const userMessage: Message = {
        id: savedUserMessage.id,
        content: savedUserMessage.content,
        sender: savedUserMessage.sender as "user" | "other",
        timestamp: new Date(savedUserMessage.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        file: fileData
      };
      setMessages(prev => [...prev, userMessage]);

      const gptResponse = await chatMutation.mutateAsync({
        message: content,
        fileUrl: fileData?.url
      });

      const savedGptMessage = await saveMutation.mutateAsync({
        content: gptResponse,
        sender: "other",
      });

      const assistantMessage: Message = {
        id: savedGptMessage.id,
        content: savedGptMessage.content,
        sender: savedGptMessage.sender as "user" | "other",
        timestamp: new Date(savedGptMessage.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error in chat flow:", error);
      toast.error("Failed to process message. Please try again.");
    }
  };

  const handleStarterSelect = (text: string) => {
    handleSendMessage(text);
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-[#1A1F2C] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full relative bg-[#1A1F2C]">
      <div className="flex-1 overflow-y-auto pt-48 px-4 pb-32">
        <div className="max-w-2xl mx-auto">
          {messages.map((message) => (
            <ChatMessage key={message.id} {...message} />
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start mb-4">
              <div className="bg-[#1E1E1E] text-white rounded-2xl rounded-tl-none px-4 py-2.5">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0">
        <ConversationStarters onSelect={handleStarterSelect} />
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
};
