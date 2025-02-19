
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "./TypingIndicator";

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

interface MessagesListProps {
  messages: Message[];
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export function MessagesList({ messages, isTyping, messagesEndRef }: MessagesListProps) {
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 15;

  // Scroll to bottom when messages change or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    // Initially show only the most recent messages
    if (messages.length > 0) {
      const initialMessages = messages.slice(-PAGE_SIZE);
      setDisplayedMessages(initialMessages);
      // Scroll to bottom after initial load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || isLoadingMore) return;

    // If we're near the top and have more messages to load
    if (container.scrollTop < 100 && displayedMessages.length < messages.length) {
      setIsLoadingMore(true);
      
      // Find the index of the first currently displayed message
      const firstDisplayedIndex = messages.findIndex(m => m.id === displayedMessages[0].id);
      
      // Load more messages
      const nextMessages = messages.slice(
        Math.max(0, firstDisplayedIndex - PAGE_SIZE),
        firstDisplayedIndex
      );

      // Preserve scroll position
      const oldHeight = container.scrollHeight;
      
      setDisplayedMessages(prev => [...nextMessages, ...prev]);
      
      // After updating, restore scroll position
      setTimeout(() => {
        if (container) {
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - oldHeight;
        }
        setIsLoadingMore(false);
      }, 100);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto pt-48 px-4 pb-32"
      onScroll={handleScroll}
    >
      <div className="max-w-2xl mx-auto">
        {isLoadingMore && (
          <div className="text-center py-2 text-sm text-gray-500">
            Loading more messages...
          </div>
        )}
        {displayedMessages.map((message) => (
          <ChatMessage key={message.id} {...message} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
