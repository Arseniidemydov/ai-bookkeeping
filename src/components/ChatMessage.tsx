
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
        "flex mb-4 last:mb-24", // Added last:mb-24 for extra padding on the last message
        sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          sender === "user"
            ? "bg-primary/10 text-primary rounded-tr-none"
            : "bg-[#222222] text-white rounded-tl-none"
        )}
      >
        <p className="text-sm leading-relaxed">{content}</p>
        <span className="text-xs text-muted-foreground mt-1 block">{timestamp}</span>
      </div>
    </div>
  );
}
