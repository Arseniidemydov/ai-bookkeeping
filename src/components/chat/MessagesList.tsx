
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
  return (
    <div className="flex-1 overflow-y-auto pt-48 px-4 pb-32">
      <div className="max-w-2xl mx-auto">
        {messages.map((message) => (
          <ChatMessage key={message.id} {...message} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
