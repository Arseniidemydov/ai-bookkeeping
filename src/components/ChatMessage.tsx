
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  sender: "user" | "other";
  timestamp: string;
}

const formatBoldText = (text: string) => {
  // First, properly format newlines and list items
  let formattedText = text
    .replace(/\\n/g, '\n')  // Replace \n with actual newlines
    .replace(/(\d+\.)/g, '\n$1'); // Add newline before numbered items
  
  // Split the text into segments based on whether they're bold or not
  const segments = formattedText.split(/(\*\*.*?\*\*)/g);
  
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      // Remove the ** markers and wrap in a bold span
      const boldText = segment.slice(2, -2);
      return <span key={index} className="font-semibold">{boldText}</span>;
    }
    
    // Handle regular text segments
    return <span key={index}>{segment}</span>;
  });
};

export function ChatMessage({ content, sender, timestamp }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex mb-4 last:mb-24",
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
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {formatBoldText(content)}
        </p>
        <span className="text-xs text-muted-foreground mt-1 block">{timestamp}</span>
      </div>
    </div>
  );
}
