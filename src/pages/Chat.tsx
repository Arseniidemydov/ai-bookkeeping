
import { Dashboard } from "@/components/Dashboard";
import { ChatContainer } from "@/components/ChatContainer";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const Chat = () => {
  // Initialize push notifications
  usePushNotifications();

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <Dashboard />
      <ChatContainer />
    </div>
  );
};

export default Chat;
