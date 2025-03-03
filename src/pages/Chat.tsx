
import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { ChatContainer } from "@/components/ChatContainer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Chat = () => {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("hasSeenWelcomeMessage");
    if (!hasSeenWelcome) {
      setShowWelcome(true);
    }
    
    // Add a class to the body for mobile styling
    document.body.classList.add('bg-black');
    
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  const handleWelcomeClose = () => {
    setShowWelcome(false);
    localStorage.setItem("hasSeenWelcomeMessage", "true");
  };

  return (
    <div className="h-screen bg-black flex flex-col">
      <Dashboard />
      <ChatContainer />
      
      <Dialog open={showWelcome} onOpenChange={handleWelcomeClose}>
        <DialogContent className="bg-gray-800 text-white border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-xl">Welcome to AI Bookkeeper!</DialogTitle>
            <DialogDescription className="text-gray-300 text-base">
              Welcome to your personal AI bookkeeper, just simply describe which transactions you want to add and AI will take care of the rest for you!
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;
