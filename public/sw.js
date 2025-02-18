
self.addEventListener('push', function(event) {
  console.log('Push notification received:', event);
  
  if (event.data) {
    const data = event.data.json();
    console.log('Push data:', data);
    
    // Show the notification
    const promiseChain = self.registration.showNotification(data.notification.title, {
      body: data.notification.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [100, 50, 100],
      actions: [
        {
          action: 'open',
          title: 'Open App'
        }
      ],
      data: data.notification
    });
    
    event.waitUntil(promiseChain);
    
    // Also send message to the app
    if (self.clients) {
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NOTIFICATION',
            title: data.notification.title,
            body: data.notification.body
          });
        });
      });
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received:', event);
  
  event.notification.close();
  
  // This looks to see if the current window is already open and focuses if it is
  event.waitUntil(
    self.clients.matchAll({
      type: "window"
    })
    .then(function(clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow("/");
    })
  );
});

// Handle installation and activation
self.addEventListener('install', function(event) {
  console.log('Service Worker installing.');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('Service Worker activating.');
  event.waitUntil(self.clients.claim());
});
