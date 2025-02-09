
import { Plus, FileText, BarChart2 } from "lucide-react";

interface StarterButton {
  icon: JSX.Element;
  text: string;
}

const starters: StarterButton[] = [
  { icon: <Plus className="w-4 h-4" />, text: "Add expense" },
  { icon: <Plus className="w-4 h-4" />, text: "Add income" },
  { icon: <FileText className="w-4 h-4" />, text: "Invoice creation" },
  { icon: <FileText className="w-4 h-4" />, text: "Report generation" },
  { icon: <BarChart2 className="w-4 h-4" />, text: "Tax insights" },
];

interface ConversationStartersProps {
  onSelect: (text: string) => void;
}

export function ConversationStarters({ onSelect }: ConversationStartersProps) {
  return (
    <div className="px-4 py-6 space-y-3">
      <h3 className="text-lg font-semibold text-white/90 mb-4">Conversation starters</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {starters.map((starter) => (
          <button
            key={starter.text}
            onClick={() => onSelect(starter.text)}
            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] border border-white/10 text-white/80 transition-colors duration-200"
          >
            {starter.icon}
            <span>{starter.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
