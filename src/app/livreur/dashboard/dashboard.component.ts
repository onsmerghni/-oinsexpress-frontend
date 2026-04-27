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

  constructor(
    private geo: GeolocationService,
    private ws: WebsocketService,
    private tracking: TrackingService,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.ws.connect();

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

    this.subs.push(
      interval(1000).subscribe(() => this.updateUptime())
    );

    this.isTracking.set(true);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.geo.stopTracking();
  }

  private updateUptime(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    this.uptime.set(elapsed >= 3600 ? `${h}:${m}:${s}` : `${m}:${s}`);
  }

  getStateColor(): string {
    const state = this.drivingState();
    if (state === 'AGGRESSIVE') return '#EF4444';
    if (state === 'RISKY') return '#F59E0B';
    return '#10B981';
  }

  getStateLabel(): string {
    const state = this.drivingState();
    const labels: Record<DrivingState, string> = {
      'NORMAL': 'NORMAL',
      'RISKY': 'RISQUÉ',
      'AGGRESSIVE': 'DANGEREUX'
    };
    return labels[state];
  }

  getStateMessage(): string {
    const state = this.drivingState();
    const msgs: Record<DrivingState, string> = {
      'NORMAL': 'Continuez votre conduite — Tout va bien',
      'RISKY': 'Attention — Adaptez votre conduite',
      'AGGRESSIVE': 'Danger — Ralentissez immédiatement'
    };
    return msgs[state];
  }

  goToSignaler(): void {
    this.router.navigate(['/livreur/signaler']);
  }

  signout(): void {
    this.auth.signout();
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    });
  }
}
