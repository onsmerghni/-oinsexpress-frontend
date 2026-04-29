import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {

  constructor(private http: HttpClient) {}

  // Demander permission + s'abonner aux push
  async subscribeToPush(): Promise<void> {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[Push] Non supporté par ce navigateur');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[Push] Permission refusée');
      return;
    }

    console.log('[Push] Permission accordée ✅');
  }

  // Afficher notification locale via Service Worker
  async showLocalNotification(title: string, body: string, tag: string): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const sw = await navigator.serviceWorker.ready;
      await sw.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag,
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
      console.log('[Push] Notification envoyée ✅', title);
    } catch (e) {
      console.error('[Push] Erreur showNotification:', e);
      // Fallback
      new Notification(title, { body, icon: '/icons/icon-192x192.png', tag });
    }
  }
}
