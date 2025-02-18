
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const registerServiceWorker = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('Service Worker registered:', registration);

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA'
          });

          console.log('Push subscription created:', subscription);
          setPushToken(JSON.stringify(subscription));
          setNotificationsEnabled(true);

          // Store the subscription in Supabase
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.user) {
            const { error: upsertError } = await supabase
              .from('device_tokens')
              .upsert({
                user_id: session.session.user.id,
                token: JSON.stringify(subscription)
              }, {
                onConflict: 'user_id,token'
              });

            if (upsertError) {
              console.error('Error storing push token:', upsertError);
              toast.error('Failed to register device for notifications');
              return;
            }

            console.log('Successfully stored push token');
            
            // Test the notification system
            try {
              console.log('Sending test notification to user:', session.session.user.id);
              
              const notificationData = {
                user_id: session.session.user.id,
                title: 'Notifications Enabled',
                body: 'You will now receive notifications from our app!'
              };
              
              console.log('Sending notification data:', notificationData);
              
              const { data: testData, error: testError } = await supabase.functions.invoke(
                'send-push-notification',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: notificationData
                }
              );

              console.log('Test notification response:', testData);

              if (testError) {
                console.error('Error sending test notification:', testError);
                toast.error('Failed to send test notification');
                return;
              }

              if (!testData?.success) {
                console.error('Test notification failed:', testData);
                toast.error('Failed to send test notification');
                return;
              }

              console.log('Test notification sent:', testData);
              toast.success('Successfully registered for notifications');
            } catch (error) {
              console.error('Error sending test notification:', error);
              toast.error('Failed to send test notification. Please try again.');
            }
          }
        }
      } catch (error) {
        console.error('Error registering service worker:', error);
        toast.error('Failed to register for notifications');
      }
    };

    const initializePushNotifications = async () => {
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

          await PushNotifications.register();

          PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success:', token.value);
            setPushToken(token.value);
            
            const { data: session } = await supabase.auth.getSession();
            if (session?.session?.user) {
              const { error } = await supabase
                .from('device_tokens')
                .upsert({
                  user_id: session.session.user.id,
                  token: token.value
                }, {
                  onConflict: 'user_id,token'
                });

              if (error) {
                console.error('Error storing push token:', error);
                toast.error('Failed to register device for notifications');
              }
            }
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
              await registerServiceWorker();
            }
          }
        } catch (error) {
          console.error('Error initializing web notifications:', error);
          toast.error('Failed to initialize web notifications');
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
