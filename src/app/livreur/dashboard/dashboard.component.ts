import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { GeolocationService, GpsPosition } from '../../shared/services/geolocation.service';
import { WebsocketService } from '../../shared/services/websocket.service';
import { TrackingService } from '../../shared/services/tracking.service';
import { AuthService } from '../../shared/services/auth.service';
import { DrivingState } from '../../shared/models/tracking.model';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-livreur-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class LivreurDashboardComponent implements OnInit, OnDestroy {
  private subs: Subscription[] = [];

  position = signal<GpsPosition | null>(null);
  drivingState = signal<DrivingState>('NORMAL');
  speed = signal<number>(0);
  isTracking = signal<boolean>(false);
  gpsError = signal<string | null>(null);
  uptime = signal<string>('00:00');
  startTime = Date.now();
  codeCopied = signal<boolean>(false);

  // Incidents temps réel
  incidents = signal<any[]>([]);
  unreadCount = signal<number>(0);
  showIncidents = signal<boolean>(false);

  typeMap: Record<string, { icon: string; label: string }> = {
    JAM:          { icon: '🚗', label: 'Embouteillage' },
    ACCIDENT:     { icon: '💥', label: 'Accident' },
    ROAD_BLOCKED: { icon: '🚧', label: 'Route bloquée' },
    CONSTRUCTION: { icon: '🔨', label: 'Travaux' }
  };

  constructor(
    private geo: GeolocationService,
    private ws: WebsocketService,
    private tracking: TrackingService,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    this.ws.connect();

    // Écouter les incidents des autres livreurs
    this.subs.push(
      this.ws.traffic$.subscribe(report => {
        this.incidents.update(list => [{ ...report, read: false }, ...list].slice(0, 20));
        this.unreadCount.update(n => n + 1);
      })
    );

    // Écouter le drivingState
    this.subs.push(
      this.ws.positions$.subscribe(pos => {
        const user = this.auth.currentUser();
        if (pos.livreurId === (user?.livreurId || user?.id)) {
          this.drivingState.set(pos.drivingState as DrivingState);
          if (pos.drivingState === 'AGGRESSIVE' || pos.drivingState === 'RISKY') {
            this.showNotification(pos.drivingState as DrivingState);
          }
        }
      })
    );

    // GPS tracking
    this.subs.push(
      this.geo.startTracking().subscribe(pos => {
        this.position.set(pos);
        this.speed.set(pos.speed ? pos.speed * 3.6 : 0);
        const user = this.auth.currentUser();
        if (user && this.ws.connected()) {
          this.ws.sendPosition({
            livreurId: user.livreurId || user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            latitude: pos.latitude,
            longitude: pos.longitude,
            speed: this.speed(),
            heading: pos.heading || 0,
            accuracy: pos.accuracy,
            drivingState: this.drivingState(),
            status: 'ACTIVE'
          });
        }
      })
    );

    // Timer uptime
    this.subs.push(
      interval(1000).subscribe(() => this.updateUptime())
    );

    this.isTracking.set(true);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.geo.stopTracking();
  }

  toggleIncidents(): void {
    this.showIncidents.update(v => !v);
    if (this.showIncidents()) {
      this.unreadCount.set(0);
    }
  }

  timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    return `Il y a ${Math.floor(diff / 3600)}h`;
  }

  private updateUptime(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    this.uptime.set(elapsed >= 3600 ? `${h}:${m}:${s}` : `${m}:${s}`);
  }

  private showNotification(state: DrivingState): void {
    if (!('Notification' in window)) return;
    const title = state === 'AGGRESSIVE' ? '🔴 Conduite dangereuse !' : '🟡 Conduite risquée';
    const options = {
      body: state === 'AGGRESSIVE' ? 'Ralentissez immédiatement !' : 'Adaptez votre conduite',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'driving-state'
    };
    if (Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(sw => sw.showNotification(title, options));
      } else {
        new Notification(title, options);
      }
    }
  }

  getStateColor(): string {
    const state = this.drivingState();
    if (state === 'AGGRESSIVE') return '#EF4444';
    if (state === 'RISKY') return '#F59E0B';
    return '#10B981';
  }

  getStateLabel(): string {
    const labels: Record<DrivingState, string> = {
      'NORMAL': 'NORMAL', 'RISKY': 'RISQUÉ', 'AGGRESSIVE': 'DANGEREUX'
    };
    return labels[this.drivingState()];
  }

  getStateMessage(): string {
    const msgs: Record<DrivingState, string> = {
      'NORMAL': 'Continuez votre conduite — Tout va bien',
      'RISKY': 'Attention — Adaptez votre conduite',
      'AGGRESSIVE': 'Danger — Ralentissez immédiatement'
    };
    return msgs[this.drivingState()];
  }

  goToSignaler(): void { this.router.navigate(['/livreur/signaler']); }
  signout(): void { this.auth.signout(); }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    });
  }
}
