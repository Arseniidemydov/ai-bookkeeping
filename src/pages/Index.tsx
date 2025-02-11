
import { useState, useEffect } from "react";
import { Dashboard } from "@/components/Dashboard";
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
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([]);

  // Fetch chat history
  const { data: chatHistory, isLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('timestamp', { ascending: true });

      if (error) {
        toast.error("Failed to load chat history");
        throw error;
      }

      return data || [];
    },
  });

  // Update messages when chat history is loaded
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
      }));
      setMessages(formattedMessages);
    }
  }, [chatHistory]);

  // Save message mutation
  const saveMutation = useMutation({
    mutationFn: async (message: Omit<Message, 'id' | 'timestamp'>) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{
          content: message.content,
          sender: message.sender,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });

  // GPT chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch("/api/generate-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: message }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate response");
      }

      const data = await response.json();
      return data.generatedText;
    },
  });

  const handleSendMessage = async (content: string) => {
    try {
      // Save user message
      const savedUserMessage = await saveMutation.mutateAsync({
        content,
        sender: "user",
      });

      // Update UI with user message
      const userMessage: Message = {
        id: savedUserMessage.id,
        content: savedUserMessage.content,
        sender: savedUserMessage.sender as "user" | "other",
        timestamp: new Date(savedUserMessage.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
      };
      setMessages(prev => [...prev, userMessage]);

      // Get GPT response
      const gptResponse = await chatMutation.mutateAsync(content);

      // Save GPT response
      const savedGptMessage = await saveMutation.mutateAsync({
        content: gptResponse,
        sender: "other",
      });

      // Update UI with GPT response
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
    return <div className="h-screen bg-[#f3f3f3] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>;
  }

  return (
    <div className="h-screen bg-[#f3f3f3] flex flex-col">
      <Dashboard />
      <div className="flex-1 overflow-y-auto pt-48 px-4">
        <div className="max-w-2xl mx-auto">
          {messages.length === 0 && (
            <ConversationStarters onSelect={handleStarterSelect} />
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} {...message} />
          ))}
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-white/10">
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
};

export default Index;
