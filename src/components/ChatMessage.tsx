
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  sender: "user" | "other";
  timestamp: string;
}

export function ChatMessage({ content, sender, timestamp }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex mb-4",
        sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2",
          sender === "user"
            ? "bg-primary text-white rounded-tr-none"
            : "bg-secondary text-gray-800 rounded-tl-none"
        )}
      >
        <p className="text-sm">{content}</p>
        <span className="text-xs opacity-70 mt-1 block">{timestamp}</span>
      </div>
    </div>
  );
}
