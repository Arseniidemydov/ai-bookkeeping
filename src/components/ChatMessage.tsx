
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  sender: "user" | "other";
  timestamp: string;
  file?: {
    url: string;
    type: string;
    name: string;
  };
}

const formatBoldText = (text: string) => {
  let formattedText = text
    .replace(/\\n/g, '\n')
    .replace(/(\d+\.)/g, '\n$1');
  
  const segments = formattedText.split(/(\*\*.*?\*\*)/g);
  
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      const boldText = segment.slice(2, -2);
      return <span key={index} className="font-semibold">{boldText}</span>;
    }
    return <span key={index}>{segment}</span>;
  });
};

export function ChatMessage({ content, sender, timestamp, file }: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex mb-4 last:mb-24",
        sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-4 py-2.5",
          sender === "user"
            ? "bg-[#4285F4] text-white rounded-[20px] rounded-tr-[5px]"
            : "bg-[#1E1E1E] text-white rounded-[20px] rounded-tl-[5px]"
        )}
      >
        {file && (
          <div className="mb-2">
            {file.type.startsWith('image/') ? (
              <img src={file.url} alt="Uploaded" className="max-w-full rounded-lg" />
            ) : (
              <a 
                href={file.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
              >
                <span>📎</span>
                {file.name}
              </a>
            )}
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {formatBoldText(content)}
        </p>
        <span className="text-xs text-white/70 mt-1 block">{timestamp}</span>
      </div>
    </div>
  );
}
