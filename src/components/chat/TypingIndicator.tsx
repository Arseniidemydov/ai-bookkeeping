
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-[#1E1E1E] text-white rounded-2xl rounded-tl-none px-4 py-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.2s]" />
          <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  );
}
