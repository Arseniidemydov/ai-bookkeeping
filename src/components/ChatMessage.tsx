
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { format } from "date-fns";
import html2pdf from 'html2pdf.js';
import { toast } from "sonner";
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

const formatBoldText = (text: string) => {
  // First, convert literal \n to actual line breaks
  const textWithLineBreaks = text.replace(/\\n/g, '\n');
  
  // Split text into segments that we want to process differently
  const segments: { type: 'text' | 'bold' | 'amount' | 'date'; content: string }[] = [];
  let currentText = textWithLineBreaks;

  // Process the text sequentially
  while (currentText.length > 0) {
    // Check for bold text
    if (currentText.startsWith('**')) {
      const endBold = currentText.indexOf('**', 2);
      if (endBold !== -1) {
        const boldContent = currentText.slice(2, endBold);
        segments.push({ type: 'bold', content: boldContent });
        currentText = currentText.slice(endBold + 2);
        continue;
      }
    }

    // Check for amounts ($X,XXX.XX)
    const amountMatch = currentText.match(/^\$[\d,\.]+/);
    if (amountMatch) {
      segments.push({ type: 'amount', content: amountMatch[0] });
      currentText = currentText.slice(amountMatch[0].length);
      continue;
    }

    // Check for dates (DD.MM.YYYY)
    const dateMatch = currentText.match(/^\d{2}\.\d{2}\.\d{4}/);
    if (dateMatch) {
      segments.push({ type: 'date', content: dateMatch[0].replace(/\./g, '\u2024') });
      currentText = currentText.slice(dateMatch[0].length);
      continue;
    }

    // Take the next character as regular text if no special formats match
    segments.push({ type: 'text', content: currentText[0] });
    currentText = currentText.slice(1);
  }

  // Convert segments to React elements
  return segments.map((segment, index) => {
    switch (segment.type) {
      case 'bold':
        return <span key={index} className="font-semibold whitespace-nowrap">{segment.content}</span>;
      case 'amount':
        return <span key={index} className="whitespace-nowrap">{segment.content}</span>;
      case 'date':
        return <span key={index} className="whitespace-nowrap">{segment.content}</span>;
      default:
        return <span key={index} className="whitespace-pre-line">{segment.content}</span>;
    }
  });
};

const isHTML = (str: string) => {
  const htmlRegex = /<[a-z][\s\S]*>/i;
  return htmlRegex.test(str);
};

const downloadPDF = async (content: string) => {
  try {
    const element = document.createElement('div');
    element.innerHTML = content;
    element.style.padding = '20px';
    document.body.appendChild(element);

    const opt = {
      margin: 1,
      filename: `report-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        letterRendering: true,
        useCORS: true
      },
      jsPDF: { 
        unit: 'in', 
        format: 'letter', 
        orientation: 'portrait'
      },
      pagebreak: { 
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.page-break-before',
        after: '.page-break-after',
        avoid: ['tr', 'td', 'div', 'p', 'table']
      }
    };

    await html2pdf().set(opt).from(element).save();
    document.body.removeChild(element);
    toast.success("Report downloaded as PDF");
  } catch (error) {
    console.error('Error generating PDF:', error);
    toast.error("Failed to generate PDF. Downloading as HTML instead.");
    const blob = new Blob([content], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${format(new Date(), 'yyyy-MM-dd')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
};

export function ChatMessage({ content, sender, file }: ChatMessageProps) {
  const containsHTML = isHTML(content);
  const showImageUpload = sender === "other" && (
    content.includes("Income added") || 
    content.includes("Expense added")
  );

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
        <div className="text-sm leading-relaxed">
          {containsHTML && sender === "other" ? (
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 text-white/80">
                <FileText className="w-5 h-5" />
                <span>Report {format(new Date(), 'yyyy-MM-dd')}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white flex items-center gap-1.5 -ml-2"
                onClick={() => downloadPDF(content)}
              >
                <Download className="w-4 h-4" />
                Download Report
              </Button>
            </div>
          ) : (
            formatBoldText(content)
          )}
        </div>
        {showImageUpload && <TransactionImageUpload />}
      </div>
    </div>
  );
}
