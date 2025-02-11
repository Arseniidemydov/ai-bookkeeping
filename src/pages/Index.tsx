
import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationStarters } from "@/components/ConversationStarters";
import { useQuery, useMutation } from "@tanstack/react-query";

interface Message {
  id: number;
  content: string;
  sender: "user" | "other";
  timestamp: string;
}

const chatHistory = "chat_history";

const Index = () => {
  // Load chat history from localStorage
  const loadChatHistory = (): Message[] => {
    const saved = localStorage.getItem(chatHistory);
    if (saved) {
      return JSON.parse(saved);
    }
    return [
      {
        id: 1,
        content: "Hi there! How can I help you today?",
        sender: "other",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  };

  const [messages, setMessages] = useState<Message[]>(loadChatHistory());

  // Save messages to localStorage whenever they change
  const saveMessages = (newMessages: Message[]) => {
    localStorage.setItem(chatHistory, JSON.stringify(newMessages));
    setMessages(newMessages);
  };

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
    const newMessage: Message = {
      id: messages.length + 1,
      content,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    
    // Save user message
    const updatedMessages = [...messages, newMessage];
    saveMessages(updatedMessages);

    try {
      // Get GPT response
      const gptResponse = await chatMutation.mutateAsync(content);
      
      // Add GPT response to messages
      const assistantMessage: Message = {
        id: updatedMessages.length + 1,
        content: gptResponse,
        sender: "other",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      
      saveMessages([...updatedMessages, assistantMessage]);
    } catch (error) {
      console.error("Failed to get GPT response:", error);
      // Add error message
      const errorMessage: Message = {
        id: updatedMessages.length + 1,
        content: "Sorry, I couldn't process your request. Please try again.",
        sender: "other",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      saveMessages([...updatedMessages, errorMessage]);
    }
  };

  const handleStarterSelect = (text: string) => {
    handleSendMessage(text);
  };

  return (
    <div className="h-screen bg-[#f3f3f3] flex flex-col">
      <Dashboard />
      <div className="flex-1 overflow-y-auto pt-48 px-4">
        <div className="max-w-2xl mx-auto">
          {messages.length === 1 && (
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
