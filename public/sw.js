
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  console.log('[Service Worker] Push had this data:', event.data?.text());

  try {
    const data = event.data?.json() ?? {};
    
    const options = {
      body: data.body || 'No content',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      data: {
        timestamp: data.timestamp,
        url: self.registration.scope
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'New Notification', options)
    );
  } catch (error) {
    console.error('[Service Worker] Error showing notification:', error);
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click received.');

  event.notification.close();

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/chat');
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activated');
});

self.addEventListener('install', event => {
  console.log('[Service Worker] Installed');
});
