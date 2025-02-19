
import { useRef } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ConversationStarters } from "@/components/ConversationStarters";
import { LoadingSpinner } from "./chat/LoadingSpinner";
import { MessagesList } from "./chat/MessagesList";
import { useChat } from "@/hooks/useChat";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const ChatContainer = () => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, setMessages, isLoading, chatMutation, saveMutation, uploadMutation } = useChat();

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

      const userMessage = {
        id: savedUserMessage.id,
        content: savedUserMessage.content,
        sender: savedUserMessage.sender as "user" | "other",
        timestamp: new Date(savedUserMessage.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        file: fileData
      };
      setMessages(prev => [...prev, userMessage]);

      // Scroll to bottom when sending a new message
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

      const gptResponse = await chatMutation.mutateAsync({
        message: content,
        fileUrl: fileData?.url
      });

      const savedGptMessage = await saveMutation.mutateAsync({
        content: gptResponse,
        sender: "other",
      });

      const assistantMessage = {
        id: savedGptMessage.id,
        content: savedGptMessage.content,
        sender: savedGptMessage.sender as "user" | "other",
        timestamp: new Date(savedGptMessage.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Scroll to bottom after receiving response
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      console.error("Error in chat flow:", error);
      toast.error("Failed to process message. Please try again.");
    }
  };

  const handleStarterSelect = (text: string) => {
    handleSendMessage(text);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex-1 flex flex-col h-full relative bg-[#111111]">
      <MessagesList 
        messages={messages}
        isTyping={chatMutation.isPending}
        messagesEndRef={messagesEndRef}
      />
      <div className="fixed bottom-0 left-0 right-0">
        <ConversationStarters onSelect={handleStarterSelect} />
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
};
