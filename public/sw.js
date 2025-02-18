
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  console.log('[Service Worker] Push had this data:', event.data?.text());

  try {
    const data = event.data?.json() ?? {};
    const notification = data.notification || data;
    
    const options = {
      body: notification.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      tag: 'message',
      renotify: true,
      requireInteraction: false,
      actions: [
        {
          action: 'open_app',
          title: 'Open App'
        }
      ],
      data: {
        url: '/',
        ...notification.data
      }
    };

    event.waitUntil(
      self.registration.showNotification(notification.title, options)
    );
  } catch (error) {
    console.error('[Service Worker] Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received.');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(function(clientList) {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installing Service Worker...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activating Service Worker...');
  event.waitUntil(self.clients.claim());
});
