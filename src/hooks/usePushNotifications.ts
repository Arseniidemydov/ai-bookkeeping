
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
      if (Capacitor.isNativePlatform()) {
        // Native mobile implementation
        try {
          const permStatus = await PushNotifications.checkPermissions();
          
          if (permStatus.receive === 'prompt') {
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
            await storeToken(token.value);
          });

          PushNotifications.addListener('registrationError', (err) => {
            console.error('Push registration failed:', err.error);
            toast.error('Failed to register for push notifications');
          });

          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push notification received:', notification);
            toast.info(notification.title, {
              description: notification.body
            });
          });

          PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push notification action performed:', notification);
          });

        } catch (error) {
          console.error('Error initializing push notifications:', error);
          toast.error('Failed to initialize push notifications');
        }
      } else {
        // Web PWA implementation
        try {
          if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
              setNotificationsEnabled(true);
              
              // Register the service worker for PWA
              if ('serviceWorker' in navigator) {
                try {
                  const registration = await navigator.serviceWorker.register('/sw.js');
                  console.log('Service Worker registered successfully:', registration);
                  
                  const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA'
                  });
                  
                  const token = JSON.stringify(subscription);
                  console.log('Push subscription created:', token);
                  setPushToken(token);
                  await storeToken(token);
                } catch (error) {
                  console.error('Service Worker registration failed:', error);
                  toast.error('Failed to register Service Worker');
                }
              }
            }
          }
        } catch (error) {
          console.error('Error initializing web notifications:', error);
          toast.error('Failed to initialize web notifications');
        }
      }
    };

    const storeToken = async (token: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        console.error('No user session found');
        return;
      }

      try {
        console.log('Storing token for user:', session.session.user.id);
        const { error } = await supabase
          .from('device_tokens')
          .upsert(
            {
              user_id: session.session.user.id,
              token: token,
            },
            {
              onConflict: 'user_id,token'
            }
          );

        if (error) {
          console.error('Error storing push token:', error);
          toast.error('Failed to register device for notifications');
        } else {
          console.log('Successfully stored push token');
          toast.success('Successfully registered for notifications');
        }
      } catch (error) {
        console.error('Error in storeToken:', error);
        toast.error('Failed to register device for notifications');
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
