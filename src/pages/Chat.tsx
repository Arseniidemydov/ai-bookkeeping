
import { Dashboard } from "@/components/Dashboard";
import { ChatContainer } from "@/components/ChatContainer";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Chat = () => {
  const [permissionDenied, setPermissionDenied] = useState(false);
  const { notificationsEnabled } = usePushNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please login to access this page');
        navigate('/auth');
      }
    };
    
    checkAuth();
  }, [navigate]);

  const requestNotifications = async () => {
    if ('Notification' in window) {
      try {
        // First check the current permission status
        if (Notification.permission === 'denied') {
          setPermissionDenied(true);
          toast.error('Notifications are blocked. Please enable them in your browser settings.');
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setPermissionDenied(false);
          toast.success('Notifications enabled!');
        } else {
          setPermissionDenied(true);
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

  useEffect(() => {
    if (!notificationsEnabled) {
      requestNotifications();
    }
  }, [notificationsEnabled]);

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {permissionDenied && (
        <div className="bg-yellow-500/10 p-2 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={requestNotifications}
            className="flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            Enable Notifications
          </Button>
        </div>
      )}
      <Dashboard />
      <ChatContainer />
    </div>
  );
};

export default Chat;
