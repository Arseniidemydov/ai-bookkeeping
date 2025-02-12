
import { useState, useEffect, useRef } from "react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch chat history
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
          thread_id: threadId
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
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: { 
          prompt: message,
          userId: session.session.user.id,
          threadId: threadId
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

  const handleSendMessage = async (content: string) => {
    try {
      // Check authentication
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error("Please sign in to send messages");
        return;
      }

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
    <div className="h-screen bg-gray-900 flex flex-col">
      <Dashboard />
      <ConversationStarters onSelect={handleStarterSelect} />
      <div className="flex-1 overflow-y-auto pt-48 px-4">
        <div className="max-w-2xl mx-auto">
          {messages.map((message) => (
            <ChatMessage key={message.id} {...message} />
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start mb-4">
              <div className="bg-[#222222] text-white rounded-2xl rounded-tl-none px-4 py-2.5">
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
      <div className="sticky bottom-0 border-t border-white/10">
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
};

export default Index;
