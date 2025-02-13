
export function LoadingSpinner() {
  return (
    <div className="h-screen bg-[#111111] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
    </div>
  );
}
