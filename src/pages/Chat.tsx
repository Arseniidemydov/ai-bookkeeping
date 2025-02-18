
import { Dashboard } from "@/components/Dashboard";
import { ChatContainer } from "@/components/ChatContainer";

const Chat = () => {
  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <Dashboard />
      <ChatContainer />
    </div>
  );
};

export default Chat;
