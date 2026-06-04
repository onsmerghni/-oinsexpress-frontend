import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TrackingService } from '../../shared/services/tracking.service';
import { GeolocationService } from '../../shared/services/geolocation.service';
import { AuthService } from '../../shared/services/auth.service';
import { WebsocketService } from '../../shared/services/websocket.service';
import { TrafficReport } from '../../shared/models/tracking.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-signaler',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signaler.component.html',
  styleUrls: ['./signaler.component.scss']
})
export class SignalerComponent implements OnInit, OnDestroy {
  form: FormGroup;
  loading = signal<boolean>(false);
  success = signal<boolean>(false);
  error = signal<string | null>(null);
  incidents = signal<any[]>([]);

  private sub?: Subscription;

  types = [
    { id: 'JAM',          label: 'Embouteillage', icon: '🚗', color: '#F59E0B' },
    { id: 'ACCIDENT',     label: 'Accident',       icon: '💥', color: '#EF4444' },
    { id: 'ROAD_BLOCKED', label: 'Route bloquée',  icon: '🚧', color: '#DC2626' },
    { id: 'CONSTRUCTION', label: 'Travaux',         icon: '🔨', color: '#3B82F6' }
  ];

  typeMap: Record<string, { icon: string; color: string; label: string }> = {
    JAM:          { icon: '🚗', color: '#F59E0B', label: 'Embouteillage' },
    ACCIDENT:     { icon: '💥', color: '#EF4444', label: 'Accident' },
    ROAD_BLOCKED: { icon: '🚧', color: '#DC2626', label: 'Route bloquée' },
    CONSTRUCTION: { icon: '🔨', color: '#3B82F6', label: 'Travaux' }
  };

  constructor(
    private fb: FormBuilder,
    private tracking: TrackingService,
    private geo: GeolocationService,
    private auth: AuthService,
    private ws: WebsocketService,
    private router: Router
  ) {
    this.form = this.fb.group({
      type: ['', Validators.required],
      description: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  ngOnInit(): void {
    this.ws.connect();
    this.sub = this.ws.traffic$.subscribe(report => {
      this.incidents.update(list => [report, ...list].slice(0, 10));
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  selectType(type: string): void { this.form.patchValue({ type }); }

  timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    return `Il y a ${Math.floor(diff / 3600)}h`;
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const pos = this.geo.currentPosition();
    if (!pos) { this.error.set('Position GPS requise'); return; }

    this.loading.set(true);
    this.error.set(null);

    const user = this.auth.currentUser();
    const report: TrafficReport = {
      livreurId: user?.livreurId || user?.id || '',
      type: this.form.value.type,
      description: this.form.value.description,
      latitude: pos.latitude,
      longitude: pos.longitude
    };

    this.tracking.reportTraffic(report).subscribe({
      next: () => {
        this.ws.sendTrafficReport({ ...report, timestamp: Date.now() });
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/livreur/dashboard']), 1500);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Erreur lors de l\'envoi');
      }
    });
  }

  hasError(f: string, e: string): boolean {
    const c = this.form.get(f);
    return !!(c?.hasError(e) && c.touched);
  }

  isSelected(type: string): boolean { return this.form.value.type === type; }
}
