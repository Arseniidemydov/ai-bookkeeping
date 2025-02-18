
import { PushNotifications } from '@capacitor/push-notifications';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const storeToken = async (token: string) => {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      console.error('No user session found');
      return;
    }

    try {
      // Delete any existing tokens for this user first
      const { error: deleteError } = await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', session.session.user.id);

      if (deleteError) {
        console.error('Error cleaning up old tokens:', deleteError);
      }

      // Store the new token
      const { error: insertError } = await supabase
        .from('device_tokens')
        .insert({
          user_id: session.session.user.id,
          token: token
        });

      if (insertError) {
        console.error('Error storing push token:', insertError);
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

  const refreshNotificationToken = async () => {
    if (Capacitor.isNativePlatform()) {
      // Re-register for native platform
      await PushNotifications.register();
    } else if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          console.error('No service worker registration found');
          return;
        }

        // First unsubscribe from existing subscription
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          await existingSubscription.unsubscribe();
        }

        // Create new subscription
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA'
        });

        const token = JSON.stringify(subscription);
        console.log('New web push subscription created:', token);
        setPushToken(token);
        await storeToken(token);
      } catch (error) {
        console.error('Error refreshing web push token:', error);
        toast.error('Failed to refresh notification registration');
      }
    }
  };

  useEffect(() => {
    const initializePushNotifications = async () => {
      if (Capacitor.isNativePlatform()) {
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
      } else if ('Notification' in window) {
        try {
          const permission = await Notification.requestPermission();
          
          if (permission === 'granted') {
            setNotificationsEnabled(true);
            
            if ('serviceWorker' in navigator) {
              try {
                // Register service worker
                const registration = await navigator.serviceWorker.register('/sw.js', {
                  scope: '/'
                });
                console.log('Service Worker registered successfully:', registration);

                // Wait for the service worker to be ready
                await navigator.serviceWorker.ready;
                
                // First check for existing subscription
                const existingSubscription = await registration.pushManager.getSubscription();
                if (existingSubscription) {
                  const token = JSON.stringify(existingSubscription);
                  console.log('Using existing push subscription:', token);
                  setPushToken(token);
                  await storeToken(token);
                  return;
                }

                // Create new subscription if none exists
                const subscription = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: 'BKS0hAdxmnZePXzcxhACUDE1jBHYMm572krHs81Eu8t--3et5PYs_H9JrqG1g5_Us3eq12jyH1dhnWs8sk5VsmA'
                });
                
                const token = JSON.stringify(subscription);
                console.log('New push subscription created:', token);
                setPushToken(token);
                await storeToken(token);

                // Set up message listener for the service worker
                navigator.serviceWorker.addEventListener('message', (event) => {
                  console.log('Received message from service worker:', event.data);
                  if (event.data.type === 'NOTIFICATION') {
                    toast.info(event.data.title, {
                      description: event.data.body
                    });
                  }
                });
              } catch (error) {
                console.error('Service Worker registration failed:', error);
                toast.error('Failed to register Service Worker');
              }
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
    notificationsEnabled,
    refreshToken: refreshNotificationToken
  };
}
