
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { TransactionImageUpload } from "./chat/TransactionImageUpload";

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

export function ChatMessage({ content, sender, timestamp, file }: ChatMessageProps) {
  const showImageUpload = sender === "other" && (
    content.includes("Income added") || 
    content.includes("Expense added")
  );

  return (
    <div
      className={cn(
        "group relative mb-4 flex items-start gap-3 rounded-lg px-4 py-3",
        sender === "user"
          ? "ml-auto bg-primary/10 backdrop-blur"
          : "bg-muted/50 backdrop-blur"
      )}
    >
      <div className="flex-1 space-y-2">
        <div className="prose-sm prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {file && (
          <div className="mt-2 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm text-gray-400">{file.name}</span>
            <Button variant="ghost" size="icon" asChild>
              <a href={file.url} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
        {showImageUpload && (
          <TransactionImageUpload />
        )}
      </div>
      <time
        dateTime={timestamp}
        className="absolute right-4 top-4 select-none text-xs text-gray-500"
      >
        {timestamp}
      </time>
    </div>
  );
}
