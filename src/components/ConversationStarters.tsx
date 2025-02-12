
import { Plus, FileText, BarChart2 } from "lucide-react";

interface StarterButton {
  icon: JSX.Element;
  text: string;
}

interface ConversationStartersProps {
  onSelect: (text: string) => void;
}

const starters: StarterButton[] = [
  { icon: <Plus className="w-4 h-4" />, text: "Add expense" },
  { icon: <Plus className="w-4 h-4" />, text: "Add income" },
  { icon: <FileText className="w-4 h-4" />, text: "Invoice creation" },
  { icon: <FileText className="w-4 h-4" />, text: "Report generation" },
  { icon: <BarChart2 className="w-4 h-4" />, text: "Tax insights" },
];

export function ConversationStarters({ onSelect }: ConversationStartersProps) {
  return (
    <div className="fixed bottom-24 left-0 right-0 px-4 py-2 bg-gray-900/80 backdrop-blur-lg border-t border-white/10">
      <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {starters.map((starter) => (
          <button
            key={starter.text}
            onClick={() => onSelect(starter.text)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-white/80 whitespace-nowrap transition-colors border border-white/10"
          >
            {starter.icon}
            <span>{starter.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
