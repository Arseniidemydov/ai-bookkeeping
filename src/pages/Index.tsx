
import { useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ConversationStarters } from "@/components/ConversationStarters";

interface Message {
  id: number;
  content: string;
  sender: "user" | "other";
  timestamp: string;
}

const Index = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      content: "Hi there! How can I help you today?",
      sender: "other",
      timestamp: "09:00 AM",
    },
  ]);

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: messages.length + 1,
      content,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([...messages, newMessage]);

    // Simulate response
    setTimeout(() => {
      const response: Message = {
        id: messages.length + 2,
        content: "Thanks for your message! I'll get back to you soon.",
        sender: "other",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, response]);
    }, 1000);
  };

  const handleStarterSelect = (text: string) => {
    handleSendMessage(text);
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
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
      <div className="sticky bottom-0">
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
};

export default Index;
