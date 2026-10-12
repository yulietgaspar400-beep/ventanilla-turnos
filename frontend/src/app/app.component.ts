import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Turno { id: number; folio: string; servicio: string; estado: string; creado_en: string; llamado_en?: string; atendido_en?: string; }
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
    <section class="intro"><div><div class="eyebrow">CENTRO DE ATENCIÓN</div><h1>Gestión de turnos</h1><p>Asigna turnos y organiza la atención en ventanilla.</p></div><div class="date">{{ today | date:'EEEE, d MMMM y' }}</div></section>
    <section class="stats">
      <article class="stat"><span class="stat-icon blue">↗</span><div><span class="stat-label">Pendientes</span><strong>{{ dashboard?.pendientes ?? 0 }}</strong></div></article>
      <article class="stat"><span class="stat-icon amber">◷</span><div><span class="stat-label">En atención</span><strong>{{ dashboard?.llamados ?? 0 }}</strong></div></article>
      <article class="stat"><span class="stat-icon green">✓</span><div><span class="stat-label">Atendidos hoy</span><strong>{{ dashboard?.atendidos ?? 0 }}</strong></div></article>
    </section>
    <section class="grid">
      <article class="panel form-panel"><div class="panel-head"><div><div class="eyebrow">NUEVO REGISTRO</div><h2>Asignar turno</h2></div><span class="round-icon">＋</span></div>
        <form (ngSubmit)="crear()"><button class="primary" type="submit" [disabled]="guardando">{{ guardando ? 'Registrando…' : 'Asignar turno' }} <span>→</span></button><p class="error" *ngIf="error">{{ error }}</p><p class="success" *ngIf="nuevo">Turno {{ nuevo.folio }} asignado correctamente.</p></form>
      </article>
      <article class="panel next-panel"><div class="panel-head"><div><div class="eyebrow">SIGUIENTE EN FILA</div><h2>Control de atención</h2></div><button class="refresh" (click)="cargar()" aria-label="Actualizar">↻</button></div>
        <div class="next-card" *ngIf="dashboard?.siguiente as next; else empty"><div class="queue-tag">{{ next.servicio }}</div><div class="folio">{{ next.folio }}</div><button class="primary call" (click)="llamar(next)">Llamar a ventanilla <span>→</span></button><button class="complete" (click)="completar(next)">Marcar como atendido</button></div>
        <ng-template #empty><div class="empty"><span>✓</span><strong>Fila al día</strong><p>No hay turnos pendientes por atender.</p></div></ng-template>
      </article>
    </section>
    <section class="panel history"><div class="panel-head"><div><div class="eyebrow">ACTIVIDAD RECIENTE</div><h2>Historial de turnos</h2></div><span class="period">Últimos 4 meses</span></div>
      <div class="table-wrap"><table><thead><tr><th>FOLIO</th><th>SERVICIO</th><th>FECHA</th><th>ESTADO</th><th></th></tr></thead><tbody><tr *ngFor="let t of turnos"><td class="folio-cell">{{ t.folio }}</td><td>{{ t.servicio }}</td><td>{{ t.creado_en | date:'d MMM, HH:mm' }}</td><td><span class="badge" [class]="'badge '+t.estado">{{ estadoLabel(t.estado) }}</span></td><td><button *ngIf="t.estado !== 'atendido'" class="row-action" (click)="completar(t)">Completar</button></td></tr><tr *ngIf="!turnos.length"><td colspan="5" class="no-data">Aún no hay turnos registrados.</td></tr></tbody></table></div>
    </section>
    <footer>Ventanilla <span>·</span> Panel de operación</footer>
  </main>
  </ng-template>`
})
export class AppComponent implements OnInit {
  private readonly storageKey = 'ventanilla-turnos-demo-v1';
  isSala = window.location.pathname.replace(/\/$/, '') === '/sala';
  salaTurnos: { folio: string; servicio: string; llamado_en: string }[] = [];
  private salaTimer?: number;
  private storageListener = (event: StorageEvent) => {
    if (event.key === this.storageKey) this.cargar();
  };
  today = new Date(); guardando = false;
  error = ''; nuevo: Turno | null = null; turnos: Turno[] = []; dashboard: Dashboard | null = null;
  ngOnInit() {
    window.addEventListener('storage', this.storageListener);
    if (this.isSala) {
      this.cargarSala();
      this.salaTimer = window.setInterval(() => { this.today = new Date(); this.cargarSala(); }, 5000);
    } else {
      this.cargar();
    }
  }
  ngOnDestroy() {
    if (this.salaTimer) window.clearInterval(this.salaTimer);
    window.removeEventListener('storage', this.storageListener);
  }
  private leerTurnos(): Turno[] {
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '[]') as Turno[]; }
    catch { return []; }
  }
  private guardarTurnos(turnos: Turno[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(turnos));
    this.cargar();
  }
  cargarSala() {
    this.salaTurnos = this.leerTurnos()
      .filter(t => t.estado === 'llamado')
      .sort((a, b) => (b.llamado_en || '').localeCompare(a.llamado_en || ''))
      .slice(0, 8)
      .map(t => ({ folio: t.folio, servicio: t.servicio, llamado_en: t.llamado_en || '' }));
  }
  cargar() {
    const all = this.leerTurnos();
    const since = Date.now() - 120 * 24 * 60 * 60 * 1000;
    this.turnos = all.filter(t => new Date(t.creado_en).getTime() >= since)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    const todayKey = new Date().toDateString();
    const today = all.filter(t => new Date(t.creado_en).toDateString() === todayKey);
    this.dashboard = {
      pendientes: today.filter(t => t.estado === 'pendiente').length,
      llamados: today.filter(t => t.estado === 'llamado').length,
      atendidos: today.filter(t => t.estado === 'atendido').length,
      siguiente: all.filter(t => t.estado === 'pendiente').sort((a, b) => a.creado_en.localeCompare(b.creado_en))[0] || null
    };
    if (this.isSala) this.cargarSala();
  }
  crear() {
    this.guardando = true; this.error = ''; this.nuevo = null;
    const all = this.leerTurnos();
    const now = new Date();
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const sequence = all.filter(t => t.folio.startsWith(`V-${day}-`)).length + 1;
    const turno: Turno = {
      id: Date.now(), folio: `V-${day}-${String(sequence).padStart(3, '0')}`,
      servicio: 'Ventanilla', estado: 'pendiente', creado_en: now.toISOString()
    };
    this.nuevo = turno;
    this.guardarTurnos([turno, ...all]);
    this.guardando = false;
  }
  llamar(t: Turno) {
    this.error = '';
    const now = new Date().toISOString();
    this.guardarTurnos(this.leerTurnos().map(row => row.id === t.id
      ? { ...row, estado: 'llamado', llamado_en: now } : row));
  }
  completar(t: Turno) {
    this.error = '';
    this.guardarTurnos(this.leerTurnos().map(row => row.id === t.id
      ? { ...row, estado: 'atendido', atendido_en: new Date().toISOString() } : row));
  }
  estadoLabel(s: string) { return ({pendiente:'Pendiente', llamado:'En atención', atendido:'Atendido'} as Record<string,string>)[s] || s; }
}
