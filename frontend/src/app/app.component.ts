import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Turno { id: number; folio: string; nombre: string; servicio: string; estado: string; creado_en: string; }
interface Dashboard { pendientes: number; llamados: number; atendidos: number; siguiente: Turno | null; }

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule],
  template: `
  <ng-container *ngIf="isSala; else operador">
    <header class="topbar"><div class="brand"><span class="brand-mark">V</span><span>Ventanilla<span class="brand-light"> / Sala de espera</span></span></div><a class="view-link" href="/">Panel de operación</a></header>
    <main class="waiting-room">
      <section class="waiting-heading"><div class="eyebrow">CENTRO DE ATENCIÓN</div><h1>Turnos llamados</h1><p>Por favor, acércate a ventanilla cuando veas tu folio.</p></section>
      <section class="waiting-current" *ngIf="salaTurnos.length; else quietRoom"><div class="waiting-label">LLAMADO RECIENTEMENTE</div><div class="waiting-ticket">{{ salaTurnos[0].folio }}</div><div class="waiting-service">{{ salaTurnos[0].servicio }} · Ventanilla 1</div></section>
      <ng-template #quietRoom><section class="waiting-current waiting-empty"><div class="empty-mark">✓</div><h2>En espera de un llamado</h2><p>En breve aparecerán aquí los turnos llamados.</p></section></ng-template>
      <section class="waiting-list" *ngIf="salaTurnos.length > 1"><h2>Llamados recientes</h2><div class="waiting-row" *ngFor="let t of salaTurnos.slice(1)"><strong>{{ t.folio }}</strong><span>{{ t.servicio }}</span><span>Ventanilla 1</span></div></section>
      <footer>La pantalla se actualiza automáticamente <span>·</span> {{ today | date:'shortTime' }}</footer>
    </main>
  </ng-container>
  <ng-template #operador>
  <header class="topbar"><div class="brand"><span class="brand-mark">V</span><span>Ventanilla<span class="brand-light"> / Atención</span></span></div><span class="live"><i></i> Sistema operativo</span><a class="view-link" href="/sala" target="_blank">Abrir sala de espera ↗</a></header>
  <main>
    <section class="intro"><div><div class="eyebrow">CENTRO DE ATENCIÓN</div><h1>Gestión de turnos</h1><p>Registra clientes y organiza la atención en ventanilla.</p></div><div class="date">{{ today | date:'EEEE, d MMMM y' }}</div></section>
    <section class="stats">
      <article class="stat"><span class="stat-icon blue">↗</span><div><span class="stat-label">Pendientes</span><strong>{{ dashboard?.pendientes ?? 0 }}</strong></div></article>
      <article class="stat"><span class="stat-icon amber">◷</span><div><span class="stat-label">En atención</span><strong>{{ dashboard?.llamados ?? 0 }}</strong></div></article>
      <article class="stat"><span class="stat-icon green">✓</span><div><span class="stat-label">Atendidos hoy</span><strong>{{ dashboard?.atendidos ?? 0 }}</strong></div></article>
    </section>
    <section class="grid">
      <article class="panel form-panel"><div class="panel-head"><div><div class="eyebrow">NUEVO REGISTRO</div><h2>Asignar turno</h2></div><span class="round-icon">＋</span></div>
        <form (ngSubmit)="crear()"><label for="nombre">Nombre del cliente</label><input id="nombre" name="nombre" [(ngModel)]="nombre" placeholder="Ej. Ana García" required minlength="2" maxlength="100"><label for="servicio">Tipo de servicio</label><select id="servicio" name="servicio" [(ngModel)]="servicio"><option>Caja</option><option>Atención al cliente</option><option>Asesoría</option></select><button class="primary" type="submit" [disabled]="guardando || !nombre.trim()">{{ guardando ? 'Registrando…' : 'Asignar turno' }} <span>→</span></button><p class="error" *ngIf="error">{{ error }}</p><p class="success" *ngIf="nuevo">Turno {{ nuevo.folio }} asignado correctamente.</p></form>
      </article>
      <article class="panel next-panel"><div class="panel-head"><div><div class="eyebrow">SIGUIENTE EN FILA</div><h2>Control de atención</h2></div><button class="refresh" (click)="cargar()" aria-label="Actualizar">↻</button></div>
        <div class="next-card" *ngIf="dashboard?.siguiente as next; else empty"><div class="queue-tag">{{ next.servicio }}</div><div class="folio">{{ next.folio }}</div><div class="customer">{{ next.nombre }}</div><button class="primary call" (click)="llamar(next)">Llamar a ventanilla <span>→</span></button><button class="complete" (click)="completar(next)">Marcar como atendido</button></div>
        <ng-template #empty><div class="empty"><span>✓</span><strong>Fila al día</strong><p>No hay turnos pendientes por atender.</p></div></ng-template>
      </article>
    </section>
    <section class="panel history"><div class="panel-head"><div><div class="eyebrow">ACTIVIDAD RECIENTE</div><h2>Historial de turnos</h2></div><span class="period">Últimos 4 meses</span></div>
      <div class="table-wrap"><table><thead><tr><th>FOLIO</th><th>CLIENTE</th><th>SERVICIO</th><th>FECHA</th><th>ESTADO</th><th></th></tr></thead><tbody><tr *ngFor="let t of turnos"><td class="folio-cell">{{ t.folio }}</td><td>{{ t.nombre }}</td><td>{{ t.servicio }}</td><td>{{ t.creado_en | date:'d MMM, HH:mm' }}</td><td><span class="badge" [class]="'badge '+t.estado">{{ estadoLabel(t.estado) }}</span></td><td><button *ngIf="t.estado !== 'atendido'" class="row-action" (click)="completar(t)">Completar</button></td></tr><tr *ngIf="!turnos.length"><td colspan="6" class="no-data">Aún no hay turnos registrados.</td></tr></tbody></table></div>
    </section>
    <footer>Ventanilla <span>·</span> Panel de operación</footer>
  </main>
  </ng-template>`
})
export class AppComponent implements OnInit {
  private http = inject(HttpClient);
  private api = '/api';
  isSala = window.location.pathname.replace(/\/$/, '') === '/sala';
  salaTurnos: { folio: string; servicio: string; llamado_en: string }[] = [];
  private salaTimer?: number;
  today = new Date(); nombre = ''; servicio = 'Caja'; guardando = false;
  error = ''; nuevo: Turno | null = null; turnos: Turno[] = []; dashboard: Dashboard | null = null;
  ngOnInit() {
    if (this.isSala) {
      this.cargarSala();
      this.salaTimer = window.setInterval(() => { this.today = new Date(); this.cargarSala(); }, 5000);
    } else {
      this.cargar();
    }
  }
  ngOnDestroy() { if (this.salaTimer) window.clearInterval(this.salaTimer); }
  cargarSala() {
    this.http.get<{ folio: string; servicio: string; llamado_en: string }[]>(`${this.api}/sala`)
      .subscribe({next: rows => this.salaTurnos = rows, error: () => this.salaTurnos = []});
  }
  cargar() {
    this.http.get<Turno[]>(`${this.api}/turnos?months=4`).subscribe({next: x => this.turnos = x, error: () => this.error = 'No se pudo conectar con el servidor.'});
    this.http.get<Dashboard>(`${this.api}/dashboard`).subscribe({next: x => this.dashboard = x});
  }
  crear() {
    if (!this.nombre.trim()) return;
    this.guardando = true; this.error = ''; this.nuevo = null;
    this.http.post<Turno>(`${this.api}/turnos`, {nombre: this.nombre.trim(), servicio: this.servicio}).subscribe({
      next: x => { this.nuevo = x; this.nombre = ''; this.guardando = false; this.cargar(); },
      error: e => { this.error = e.error?.detail || 'No se pudo registrar el turno.'; this.guardando = false; }
    });
  }
  llamar(t: Turno) { this.http.post(`${this.api}/turnos/${t.id}/call`, {}).subscribe({next: () => this.cargar(), error: () => this.error = 'No se pudo llamar el turno.'}); }
  completar(t: Turno) { this.http.post(`${this.api}/turnos/${t.id}/complete`, {}).subscribe({next: () => this.cargar(), error: () => this.error = 'No se pudo completar el turno.'}); }
  estadoLabel(s: string) { return ({pendiente:'Pendiente', llamado:'En atención', atendido:'Atendido'} as Record<string,string>)[s] || s; }
}
