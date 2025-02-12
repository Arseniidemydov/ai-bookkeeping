
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  sender: "user" | "other";
  timestamp: string;
}

const formatBoldText = (text: string) => {
  // Split the text into segments based on whether they're bold or not
  const segments = text.split(/(\*\*.*?\*\*)/g);
  
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      // Remove the ** markers and wrap in a bold span
      const boldText = segment.slice(2, -2);
      return <span key={index} className="font-semibold">{boldText}</span>;
    }
    // Add proper spacing after periods and numbers in lists
    const formattedText = segment
      .replace(/(\d+\.)\s*/g, '$1 ') // Add space after list numbers
      .replace(/\.\s*/g, '. ') // Add space after periods
      .replace(/\s+/g, ' '); // Normalize spaces
    
    return <span key={index}>{formattedText}</span>;
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
