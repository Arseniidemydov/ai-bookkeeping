
import { Dashboard } from "@/components/Dashboard";
import { ChatContainer } from "@/components/ChatContainer";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect } from "react";
import { toast } from "sonner";

const Chat = () => {
  // Initialize push notifications
  const { notificationsEnabled } = usePushNotifications();

  useEffect(() => {
    const requestNotifications = async () => {
      if ('Notification' in window) {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            toast.success('Notifications enabled!');
          } else {
            toast.error('Please enable notifications to receive updates');
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
          toast.error('Failed to request notification permission');
        }
      } else {
        toast.error('Your browser does not support notifications');
      }
    };

    requestNotifications();
  }, []);

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <Dashboard />
      <ChatContainer />
    </div>
  );
};

export default Chat;
