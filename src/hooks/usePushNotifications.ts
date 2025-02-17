
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const initializePushNotifications = async () => {
      // Check if we're running on a native platform
      if (!Capacitor.isNativePlatform()) {
        console.log('Push notifications are only available on mobile devices');
        return;
      }

      try {
        // Check if we have permission
        const permStatus = await PushNotifications.checkPermissions();
        
        if (permStatus.receive === 'prompt') {
          // Request permission
          const permission = await PushNotifications.requestPermissions();
          if (permission.receive !== 'granted') {
            console.log('User denied push notification permission');
            return;
          }
        }

        if (permStatus.receive !== 'granted') {
          console.log('No push notification permission');
          return;
        }

        setNotificationsEnabled(true);

        // Register for push notifications
        await PushNotifications.register();

        // Add listeners
        PushNotifications.addListener('registration', async (token) => {
          console.log('Push registration success:', token.value);
          setPushToken(token.value);

          // Store token in Supabase
          const { data: session } = await supabase.auth.getSession();
          if (!session?.session?.user) {
            console.error('No user session found');
            return;
          }

          const { error } = await supabase
            .from('device_tokens')
            .upsert({
              user_id: session.session.user.id,
              token: token.value,
            }, {
              onConflict: 'user_id, token'
            });

          if (error) {
            console.error('Error storing push token:', error);
            toast.error('Failed to register for push notifications');
          } else {
            toast.success('Successfully registered for push notifications');
          }
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('Push registration failed:', err.error);
          toast.error('Failed to register for push notifications');
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received:', notification);
          // Handle received notification while app is in foreground
          toast.info(notification.title, {
            description: notification.body
          });
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed:', notification);
          // Handle notification action (e.g., when user taps the notification)
        });

      } catch (error) {
        console.error('Error initializing push notifications:', error);
        // Only show error toast on native platforms
        if (Capacitor.isNativePlatform()) {
          toast.error('Failed to initialize push notifications');
        }
      }
    };

    initializePushNotifications();

    // Cleanup listeners
    return () => {
      if (Capacitor.isNativePlatform()) {
        PushNotifications.removeAllListeners();
      }
    };
  }, []);

  return {
    pushToken,
    notificationsEnabled
  };
}
