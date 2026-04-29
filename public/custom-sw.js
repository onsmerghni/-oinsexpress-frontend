// custom-sw.js — Service Worker personnalisé OINSExpress
// Gère les notifications push même app fermée

importScripts('ngsw-worker.js');

// Écouter les push notifications
self.addEventListener('push', function(event) {
  console.log('[SW] Push reçu:', event);

  let data = {
    title: '🔔 OINSExpress Alerte',
    body: 'Nouvelle alerte de conduite',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'oinsexpress-alert',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      requireInteraction: true  // reste visible jusqu'à interaction
    })
  );
});

// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Si app déjà ouverte → focus
        for (const client of clientList) {
          if (client.url.includes('oinsexpress') && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon → ouvrir l'app
        if (clients.openWindow) {
          return clients.openWindow('/boss/map');
        }
      })
  );
});
