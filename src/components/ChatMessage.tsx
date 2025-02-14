
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

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

const isHTML = (str: string) => {
  const htmlRegex = /<[a-z][\s\S]*>/i;
  return htmlRegex.test(str);
};

const downloadHTML = (content: string) => {
  const blob = new Blob([content], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export function ChatMessage({ content, sender, timestamp, file }: ChatMessageProps) {
  const containsHTML = isHTML(content);

  return (
    <div
      className={cn(
        "flex mb-4 last:mb-24",
        sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-4 py-2.5 rounded-[20px]",
          sender === "user"
            ? "bg-[#4C6FFF] text-white rounded-tr-[5px]"
            : "bg-[#1E1E1E] text-white rounded-tl-[5px]"
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
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/60">{timestamp}</span>
          {containsHTML && sender === "other" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white flex items-center gap-1"
              onClick={() => downloadHTML(content)}
            >
              <Download className="w-4 h-4" />
              Download Report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
