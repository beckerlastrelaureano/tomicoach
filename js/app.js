/**
 * app.js — Tomicoach
 * -----------------------------------------------------------------------
 * Controlador principal. Reutiliza la misma base de 353 ejercicios y el
 * mismo criterio de diseño de Becker App, pero con login real (Firebase)
 * y dos roles: Entrenador (ve y administra a todos los alumnos) y Alumno
 * (ve y entrena solo su propia rutina).
 */

const App = (() => {

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function icon(nombre, clase = '') {
    return `<svg class="icon ${clase}" aria-hidden="true"><use href="assets/iconos/sprite.svg#icon-${nombre}"></use></svg>`;
  }
  function poseIcon(categoria, clase = '') {
    return `<svg class="pose-icon ${clase}" aria-hidden="true"><use href="assets/iconos/poses.svg#pose-${categoria}"></use></svg>`;
  }
  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatNumero(n, decimales = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }
  function formatFecha(iso, opciones = { day: '2-digit', month: 'short', year: 'numeric' }) {
    return new Date(iso).toLocaleDateString('es-ES', opciones);
  }
  function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  const state = { vistaActual: null, alumnoSeleccionadoUid: null, sesionActiva: null };

  // ---------------------------------------------------------------------
  // Toast + Modal (idéntico criterio a Becker App)
  // ---------------------------------------------------------------------
  function toast(mensaje, tipo = 'info', duracion = 3200) {
    const cont = $('#toast-container');
    if (!cont) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    const iconos = { info: 'info', exito: 'check-circle', error: 'warning', logro: 'trophy' };
    el.innerHTML = `${icon(iconos[tipo] || 'info')}<span>${escapeHtml(mensaje)}</span>`;
    cont.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-show'));
    setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), 300); }, duracion);
  }

  function abrirModal(html, { ancho = 'md', id = 'modal-generico' } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-overlay" data-modal-overlay><div class="modal modal-${ancho}" id="${id}" role="dialog" aria-modal="true">${html}</div></div>`;
    root.classList.add('modal-root-visible');
    document.body.classList.add('no-scroll');
    $('[data-modal-overlay]', root).addEventListener('click', (e) => { if (e.target.hasAttribute('data-modal-overlay')) cerrarModal(); });
    $$('[data-cerrar-modal]', root).forEach(b => b.addEventListener('click', cerrarModal));
  }
  function cerrarModal() {
    const root = $('#modal-root');
    root.innerHTML = '';
    root.classList.remove('modal-root-visible');
    document.body.classList.remove('no-scroll');
  }

  // ---------------------------------------------------------------------
  // Ilustraciones de ejercicios (mismo criterio que Becker App)
  // ---------------------------------------------------------------------
  function categoriaIlustracion(ej) {
    const n = (ej.nombre || '').toLowerCase();
    const g = ej.grupoMuscular;
    if (ej.objetivos && ej.objetivos.includes('cardio')) return 'cardio-funcional';
    if (g === 'Pecho') return /apertura|cruce|pec deck|contractora|pull-?over/.test(n) ? 'elevacion-brazo' : 'press-horizontal';
    if (g === 'Espalda') {
      if (/peso muerto|buenos días|good morning/.test(n)) return 'bisagra-cadera';
      if (/dominada|jalón|jalon|pull-?over|pulldown/.test(n)) return 'dominada';
      return 'remo';
    }
    if (g === 'Hombros') return /elevaci[oó]n|p[aá]jaro|face pull|encogimiento/.test(n) ? 'elevacion-brazo' : 'press-vertical';
    if (g === 'Bíceps') return 'curl-brazo';
    if (g === 'Tríceps') return 'extension-brazo';
    if (g === 'Trapecios') return 'elevacion-brazo';
    if (g === 'Antebrazos') return 'carga-general';
    if (g === 'Abdomen') return /plancha|hollow|postura hueca|dead hang|rollout|ab wheel/.test(n) ? 'core-plancha' : 'core-crunch';
    if (g === 'Oblicuos') return 'core-crunch';
    if (g === 'Cuádriceps') return /zancada|step up|lunge|pistol/.test(n) ? 'zancada-gemelo' : 'sentadilla';
    if (g === 'Isquiotibiales') return 'bisagra-cadera';
    if (g === 'Glúteos') return /hip thrust|puente/.test(n) ? 'bisagra-cadera' : 'zancada-gemelo';
    if (g === 'Gemelos' || g === 'Aductores' || g === 'Abductores') return 'zancada-gemelo';
    if (g === 'Lumbares') return 'bisagra-cadera';
    if (g === 'Manguito rotador') return 'elevacion-brazo';
    if (g === 'Cuello' || g === 'Columna' || g === 'Cadera' || g === 'Tobillos') return 'estiramiento';
    return 'carga-general';
  }
  function imagenEjercicioHTML(ej) {
    const pose = poseIcon(categoriaIlustracion(ej));
    if (ej.imagenesExternas && ej.imagenesExternas.length) {
      return `${pose}<img src="${escapeHtml(ej.imagenesExternas[0])}" alt="" loading="lazy" class="foto-ejercicio" onerror="this.remove()">`;
    }
    return pose;
  }
  function getExerciseById(id) { return EXERCISE_DATABASE.find(e => e.id === id) || null; }

  // ---------------------------------------------------------------------
  // Programas por objetivo (mismo contenido que Becker App, resumido)
  // ---------------------------------------------------------------------
  const NIVEL_ORDEN = { 'Principiante': 1, 'Intermedio': 2, 'Avanzado': 3 };

  const PROGRAMAS_OBJETIVO = {
    'ganancia-muscular': { nombre: 'Ganancia muscular', icono: 'trophy', dias: [
      { nombre: 'Día 1 — Pecho, hombros y tríceps', series: 3, reps: 10, descanso: 75, bloques: [{ grupo: 'Pecho', cantidad: 2 }, { grupo: 'Hombros', cantidad: 2 }, { grupo: 'Tríceps', cantidad: 2 }] },
      { nombre: 'Día 2 — Espalda y bíceps', series: 3, reps: 10, descanso: 75, bloques: [{ grupo: 'Espalda', cantidad: 3 }, { grupo: 'Bíceps', cantidad: 2 }, { grupo: 'Trapecios', cantidad: 1 }] },
      { nombre: 'Día 3 — Piernas completo', series: 3, reps: 10, descanso: 90, bloques: [{ grupo: 'Cuádriceps', cantidad: 2 }, { grupo: 'Isquiotibiales', cantidad: 2 }, { grupo: 'Glúteos', cantidad: 1 }, { grupo: 'Gemelos', cantidad: 1 }] }
    ]},
    'fuerza': { nombre: 'Fuerza', icono: 'barbell', dias: [
      { nombre: 'Día 1 — Sentadilla y pecho', series: 5, reps: 5, descanso: 180, bloques: [{ grupo: 'Cuádriceps', cantidad: 1, preferirCompuesto: true }, { grupo: 'Pecho', cantidad: 1, preferirCompuesto: true }, { grupo: 'Hombros', cantidad: 1 }] },
      { nombre: 'Día 2 — Peso muerto y espalda', series: 5, reps: 5, descanso: 180, bloques: [{ grupo: 'Isquiotibiales', cantidad: 1, preferirCompuesto: true }, { grupo: 'Espalda', cantidad: 2, preferirCompuesto: true }] }
    ]},
    'perdida-grasa': { nombre: 'Pérdida de grasa', icono: 'flame', dias: [
      { nombre: 'Circuito 1', series: 3, reps: 14, descanso: 40, bloques: [{ grupo: 'Cuádriceps', cantidad: 1 }, { grupo: 'Pecho', cantidad: 1 }, { grupo: 'Espalda', cantidad: 1 }, { grupo: 'Abdomen', cantidad: 1 }] },
      { nombre: 'Circuito 2', series: 3, reps: 14, descanso: 40, bloques: [{ grupo: 'Glúteos', cantidad: 1 }, { grupo: 'Hombros', cantidad: 1 }, { grupo: 'Espalda', cantidad: 1 }] }
    ]},
    'cardio': { nombre: 'Cardio', icono: 'timer', dias: [
      { nombre: 'Acondicionamiento 1', series: 4, reps: 15, descanso: 25, bloques: [{ grupo: 'Abdomen', cantidad: 2 }, { grupo: 'Gemelos', cantidad: 1 }] }
    ]},
    'movilidad': { nombre: 'Movilidad y elongación', icono: 'repeat', dias: [
      { nombre: 'Día 1 — Movilidad general', series: 2, reps: 1, descanso: 20, bloques: [{ grupo: 'Cadera', cantidad: 2 }, { grupo: 'Columna', cantidad: 2 }, { grupo: 'Isquiotibiales', cantidad: 1 }] }
    ]}
  };

  function elegirEjercicios(pool, grupo, cantidad, preferirCompuesto) {
    let candidatos = pool.filter(e => e.grupoMuscular === grupo);
    if (preferirCompuesto) {
      const compuestos = candidatos.filter(e => e.tipo === 'Compuesto');
      if (compuestos.length >= cantidad) candidatos = compuestos;
    }
    return candidatos.sort((a, b) => a.nombre.localeCompare(b.nombre)).slice(0, cantidad);
  }

  function generarRutinaDesdeObjetivo(objetivoKey, nivel) {
    const programa = PROGRAMAS_OBJETIVO[objetivoKey];
    const topeNivel = NIVEL_ORDEN[nivel] || 3;
    const pool = EXERCISE_DATABASE.filter(e => (NIVEL_ORDEN[e.dificultad] || 1) <= topeNivel && e.objetivos && e.objetivos.includes(objetivoKey));
    const usados = new Set();
    const dias = programa.dias.map(diaDef => {
      const ejercicios = [];
      diaDef.bloques.forEach(bloque => {
        const elegidos = elegirEjercicios(pool.filter(e => !usados.has(e.id)), bloque.grupo, bloque.cantidad, bloque.preferirCompuesto);
        elegidos.forEach(ej => {
          usados.add(ej.id);
          ejercicios.push({
            id: `ej-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ejercicioId: ej.id,
            seriesObjetivo: Array.from({ length: diaDef.series }, () => ({ reps: diaDef.reps, peso: 0 })),
            descansoSeg: diaDef.descanso
          });
        });
      });
      return { id: `dia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, nombre: diaDef.nombre, ejercicios };
    });
    return { nombre: `${programa.nombre} — nivel ${nivel.toLowerCase()}`, objetivo: objetivoKey, nivel, dias, calentamiento: [] };
  }

  // ---------------------------------------------------------------------
  // Selector de ejercicios reutilizable
  // ---------------------------------------------------------------------
  function abrirSelectorEjercicios(onSeleccionar) {
    abrirModal(`
      <div class="modal-header"><h3>Agregar ejercicio</h3><button data-cerrar-modal class="btn-icono">${icon('close')}</button></div>
      <div class="modal-body">
        <div class="buscador-wrapper">${icon('search')}<input type="text" id="selector-buscador-input" placeholder="Buscar ejercicio..." autofocus></div>
        <div id="selector-resultados" class="grid-selector-ejercicios"></div>
      </div>`, { ancho: 'lg', id: 'modal-selector-ejercicio' });

    const input = $('#selector-buscador-input');
    const cont = $('#selector-resultados');
    function pintar(texto = '') {
      const filtrados = (texto ? EXERCISE_DATABASE.filter(e => e.nombre.toLowerCase().includes(texto.toLowerCase())) : EXERCISE_DATABASE).slice(0, 40);
      cont.innerHTML = filtrados.map(e => `
        <button class="tarjeta-ejercicio" data-id="${e.id}">
          <div class="tarjeta-ejercicio-imagen">${imagenEjercicioHTML(e)}</div>
          <div class="tarjeta-ejercicio-contenido"><h4>${escapeHtml(e.nombre)}</h4><p class="texto-suave texto-pequeno">${e.grupoMuscular} · ${e.equipamiento}</p></div>
        </button>`).join('') || `<p class="texto-suave">Sin resultados.</p>`;
      $$('.tarjeta-ejercicio', cont).forEach(b => b.addEventListener('click', () => { cerrarModal(); onSeleccionar(getExerciseById(b.dataset.id)); }));
    }
    input.addEventListener('input', debounce(() => pintar(input.value)));
    pintar();
  }

  // ---------------------------------------------------------------------
  // Navegación por rol
  // ---------------------------------------------------------------------
  const RENDERERS = {};
  function cambiarVista(vista) {
    if (!RENDERERS[vista]) return;
    state.vistaActual = vista;
    $$('.view').forEach(v => v.classList.remove('view-active'));
    $(`#view-${vista}`)?.classList.add('view-active');
    $$('.nav-item').forEach(a => a.classList.toggle('nav-item-active', a.dataset.view === vista));
    $('#sidebar').classList.remove('sidebar-abierto');
    RENDERERS[vista]();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function construirSidebar(usuario) {
    const nav = $('#sidebar-nav');
    if (usuario.rol === 'superadmin') {
      nav.innerHTML = `
        <a href="#" class="nav-item" data-view="superadmin">${icon('routine')}<span>Entrenadores</span></a>`;
    } else if (usuario.rol === 'entrenador') {
      nav.innerHTML = `
        <a href="#" class="nav-item" data-view="alumnos">${icon('routine')}<span>Mis alumnos</span></a>`;
    } else {
      nav.innerHTML = `
        <a href="#" class="nav-item" data-view="mi-rutina">${icon('routine')}<span>Mi rutina</span></a>
        <a href="#" class="nav-item" data-view="mi-progreso">${icon('stats')}<span>Mi progreso</span></a>`;
    }
    $$('.nav-item', nav).forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); cambiarVista(a.dataset.view); }));
    const etiquetaRol = { superadmin: 'Administrador', entrenador: 'Entrenador', alumno: 'Alumno' }[usuario.rol] || usuario.rol;
    $('#sidebar-usuario').textContent = `${usuario.nombre} · ${etiquetaRol}`;
  }

  // =======================================================================
  // VISTA DE SUPERADMIN
  // =======================================================================
  async function renderSuperadmin() {
    const cont = $('#view-superadmin');
    cont.innerHTML = `
      <div class="panel-header-flex">
        <h2>Entrenadores</h2>
        <button class="btn btn-primario btn-sm" id="btn-nuevo-codigo">${icon('plus')} Generar código</button>
      </div>
      <div id="lista-entrenadores"><p class="texto-suave">Cargando...</p></div>
      <div class="panel-header" style="margin-top:2rem"><h3>Códigos de invitación</h3></div>
      <div id="lista-codigos"><p class="texto-suave">Cargando...</p></div>
    `;

    $('#btn-nuevo-codigo').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const nombreNegocio = prompt('¿Nombre del entrenador o del negocio? (solo para identificarlo en tu lista)') || '';
        const codigo = await FirebaseService.crearCodigoInvitacion(nombreNegocio.trim());
        toast(`Código generado: ${codigo}`, 'exito', 6000);
      } finally {
        renderSuperadmin();
      }
    });

    const [entrenadores, codigos] = await Promise.all([
      FirebaseService.listarEntrenadores(),
      FirebaseService.listarCodigosInvitacion()
    ]);

    const listaEnt = $('#lista-entrenadores');
    if (!entrenadores.length) {
      listaEnt.innerHTML = `<div class="estado-vacio"><p>${icon('routine')} Todavía no diste de alta a ningún entrenador.</p></div>`;
    } else {
      listaEnt.innerHTML = entrenadores.map(en => `
        <div class="tarjeta-objetivo" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:.6rem">
          <div>
            <h3 style="margin-bottom:.2rem">${escapeHtml(en.nombreNegocio || en.nombre)}</h3>
            <p class="texto-suave texto-pequeno" style="margin:0">${escapeHtml(en.email)}</p>
          </div>
          <div style="display:flex;align-items:center;gap:.6rem">
            <span class="badge ${en.estadoPago === 'suspendido' ? 'badge-peligro' : 'badge-exito'}">${en.estadoPago === 'suspendido' ? 'Suspendido' : 'Activo'}</span>
            <button class="btn btn-sm ${en.estadoPago === 'suspendido' ? 'btn-primario' : 'btn-peligro'}" data-uid="${en.uid}" data-accion="${en.estadoPago === 'suspendido' ? 'activar' : 'suspender'}">
              ${en.estadoPago === 'suspendido' ? 'Reactivar' : 'Suspender'}
            </button>
          </div>
        </div>`).join('');

      $$('[data-accion]', listaEnt).forEach(b => b.addEventListener('click', async () => {
        const nuevoEstado = b.dataset.accion === 'activar' ? 'activo' : 'suspendido';
        await FirebaseService.cambiarEstadoPagoEntrenador(b.dataset.uid, nuevoEstado);
        toast(nuevoEstado === 'suspendido' ? 'Entrenador suspendido.' : 'Entrenador reactivado.', 'exito');
        renderSuperadmin();
      }));
    }

    const listaCod = $('#lista-codigos');
    if (!codigos.length) {
      listaCod.innerHTML = `<p class="texto-suave">Todavía no generaste ningún código.</p>`;
    } else {
      listaCod.innerHTML = `<div class="tabla-records-wrap"><table class="tabla-records"><thead><tr><th>Código</th><th>Para</th><th>Estado</th></tr></thead><tbody>
        ${codigos.map(c => `<tr><td>${escapeHtml(c.codigo)}</td><td>${escapeHtml(c.nombreNegocio || '—')}</td><td>${c.usado ? '<span class="badge">Usado</span>' : '<span class="badge badge-exito">Disponible</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
    }
  }
  RENDERERS['superadmin'] = renderSuperadmin;

  // =======================================================================
  // VISTAS DE ENTRENADOR
  // =======================================================================
  async function renderAlumnos() {
    const cont = $('#view-alumnos');
    cont.innerHTML = `<div class="panel-header"><h2>Mis alumnos</h2></div><div id="lista-alumnos" class="grid-objetivos"><p class="texto-suave">Cargando...</p></div>`;
    const alumnos = await FirebaseService.listarAlumnos();
    const listaCont = $('#lista-alumnos');
    if (!alumnos.length) {
      listaCont.innerHTML = `<div class="estado-vacio"><p>${icon('routine')} Todavía no tenés alumnos registrados.</p><p class="texto-suave">Compartí el link de la app para que se registren, o avisame el email que usaron y los agrego.</p></div>`;
      return;
    }
    listaCont.innerHTML = alumnos.map(a => `
      <button class="tarjeta-objetivo" data-uid="${a.uid}" style="text-align:left;cursor:pointer">
        <div class="tarjeta-objetivo-header">
          <div class="tarjeta-objetivo-icono">${icon('routine')}</div>
          <div><h3>${escapeHtml(a.nombre)}</h3><span class="badge">${a.objetivo ? PROGRAMAS_OBJETIVO[a.objetivo]?.nombre || a.objetivo : 'Sin objetivo asignado'}</span></div>
        </div>
        <p class="texto-suave texto-pequeno">${escapeHtml(a.email)}</p>
      </button>`).join('');
    $$('[data-uid]', listaCont).forEach(b => b.addEventListener('click', () => {
      state.alumnoSeleccionadoUid = b.dataset.uid;
      cambiarVista('ficha-alumno');
    }));
  }
  RENDERERS['alumnos'] = renderAlumnos;

  async function renderFichaAlumno() {
    const cont = $('#view-ficha-alumno');
    const uid = state.alumnoSeleccionadoUid;
    if (!uid) { cambiarVista('alumnos'); return; }
    cont.innerHTML = `<p class="texto-suave">Cargando ficha...</p>`;

    const [alumnos, rutina, historial] = await Promise.all([
      FirebaseService.listarAlumnos(),
      FirebaseService.getRutina(uid),
      FirebaseService.getHistorial(uid)
    ]);
    const alumno = alumnos.find(a => a.uid === uid);
    if (!alumno) { cambiarVista('alumnos'); return; }

    const diasEntrenados = new Set(historial.map(h => h.fecha.slice(0, 10))).size;

    cont.innerHTML = `
      <div class="panel-header">
        <div><button class="btn btn-fantasma btn-sm" id="btn-volver-alumnos">${icon('chevron-left')} Alumnos</button>
        <h2 style="margin-top:.5rem">${escapeHtml(alumno.nombre)}</h2>
        <p class="texto-suave">${escapeHtml(alumno.email)}</p></div>
      </div>
      <div class="grid-cards-resumen" style="grid-template-columns:repeat(3,1fr)">
        <div class="card-stat"><div class="card-stat-icono">${icon('calendar')}</div><div class="card-stat-valor">${diasEntrenados}</div><div class="card-stat-label">Días entrenados</div></div>
        <div class="card-stat"><div class="card-stat-icono">${icon('routine')}</div><div class="card-stat-valor">${historial.length}</div><div class="card-stat-label">Entrenamientos totales</div></div>
        <div class="card-stat exito"><div class="card-stat-icono">${icon('stats')}</div><div class="card-stat-valor">${formatNumero(historial.reduce((s, h) => s + (h.volumenTotal || 0), 0))} kg</div><div class="card-stat-label">Volumen total</div></div>
      </div>

      <div class="panel" style="margin-bottom:1.2rem">
        <h3>Objetivo asignado</h3>
        <div class="grid-objetivos-inicio" id="picker-objetivo-alumno" style="margin-top:.8rem"></div>
      </div>

      <div class="panel" style="margin-bottom:1.2rem">
        <h3>Calendario de asistencia</h3>
        <div id="calendario-asistencia" style="margin-top:.8rem"></div>
      </div>

      <div class="panel" style="margin-bottom:1.2rem">
        <h3>Progreso (volumen por sesión)</h3>
        <div class="contenedor-grafico" style="margin-top:.8rem"><canvas id="grafico-progreso-alumno"></canvas></div>
      </div>

      <div class="panel-header"><h3>Rutina asignada</h3></div>
      <div id="dias-rutina-alumno"></div>
      ${rutina ? `<button class="btn btn-fantasma" id="btn-agregar-dia-alumno">${icon('plus')} Agregar día</button>` : ''}
    `;

    $('#btn-volver-alumnos').addEventListener('click', () => cambiarVista('alumnos'));

    $('#picker-objetivo-alumno').innerHTML = Object.entries(PROGRAMAS_OBJETIVO).map(([key, p]) => `
      <button class="tarjeta-objetivo-grande ${alumno.objetivo === key ? 'tarjeta-objetivo-grande-activa' : ''}" data-objetivo="${key}">
        <span class="tarjeta-objetivo-grande-icono">${icon(p.icono)}</span>
        <span class="tarjeta-objetivo-grande-nombre">${escapeHtml(p.nombre)}</span>
      </button>`).join('');
    $$('#picker-objetivo-alumno [data-objetivo]').forEach(b => b.addEventListener('click', () => abrirModalNivelParaAlumno(uid, b.dataset.objetivo)));

    renderCalendarioAsistencia(historial);
    renderGraficoProgresoAlumno(historial);
    renderDiasRutina(uid, rutina, true);

    $('#btn-agregar-dia-alumno')?.addEventListener('click', async () => {
      rutina.dias.push({ id: `dia-${Date.now()}`, nombre: `Día ${rutina.dias.length + 1}`, ejercicios: [] });
      await FirebaseService.guardarRutina(uid, rutina);
      renderFichaAlumno();
    });
  }
  RENDERERS['ficha-alumno'] = renderFichaAlumno;

  function abrirModalNivelParaAlumno(uid, objetivoKey) {
    const p = PROGRAMAS_OBJETIVO[objetivoKey];
    abrirModal(`
      <div class="modal-header"><h3>${icon(p.icono)} ${escapeHtml(p.nombre)}</h3><button data-cerrar-modal class="btn-icono">${icon('close')}</button></div>
      <div class="modal-body">
        <p class="texto-suave" style="margin-bottom:1rem">Elegí el nivel para generar la rutina de este alumno.</p>
        <div class="lista-niveles">
          ${['Principiante', 'Intermedio', 'Avanzado'].map((n, i) => `
            <label class="opcion-nivel"><input type="radio" name="nivel" value="${n}" ${i === 0 ? 'checked' : ''}><div><strong>${n}</strong></div></label>`).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-fantasma" data-cerrar-modal>Cancelar</button>
        <button class="btn btn-primario" id="btn-confirmar-nivel-alumno">${icon('plus')} Generar rutina</button>
      </div>`, { id: 'modal-nivel-alumno' });

    $('#btn-confirmar-nivel-alumno').addEventListener('click', async () => {
      const nivel = $('input[name="nivel"]:checked').value;
      const rutina = generarRutinaDesdeObjetivo(objetivoKey, nivel);
      await FirebaseService.guardarRutina(uid, rutina);
      await FirebaseService.actualizarFichaAlumno(uid, { objetivo: objetivoKey, nivel });
      cerrarModal();
      toast('Rutina generada y asignada.', 'logro');
      renderFichaAlumno();
    });
  }

  function renderCalendarioAsistencia(historial) {
    const cont = $('#calendario-asistencia');
    const dias = new Set(historial.map(h => h.fecha.slice(0, 10)));
    const hoy = new Date();
    const primerDia = (new Date(hoy.getFullYear(), hoy.getMonth(), 1).getDay() + 6) % 7;
    const totalDias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    let celdas = '';
    for (let i = 0; i < primerDia; i++) celdas += `<div class="dia-mini dia-mini-vacio"></div>`;
    for (let d = 1; d <= totalDias; d++) {
      const key = new Date(hoy.getFullYear(), hoy.getMonth(), d).toISOString().slice(0, 10);
      celdas += `<div class="dia-mini ${dias.has(key) ? 'dia-mini-activo' : ''}">${d}</div>`;
    }
    cont.innerHTML = `<div class="mini-calendario-grid">${celdas}</div>`;
  }

  let chartAlumno = null;
  function renderGraficoProgresoAlumno(historial) {
    const canvas = $('#grafico-progreso-alumno');
    if (!canvas || typeof Chart === 'undefined') return;
    if (chartAlumno) chartAlumno.destroy();
    chartAlumno = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: historial.map(h => formatFecha(h.fecha, { day: '2-digit', month: 'short' })),
        datasets: [{ label: 'Volumen (kg)', data: historial.map(h => h.volumenTotal || 0), borderColor: MARCA.colorAcento, backgroundColor: MARCA.colorAcento + '33', fill: true, tension: .3 }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function renderDiasRutina(uid, rutina, esEntrenadorEditando) {
    const cont = $('#dias-rutina-alumno');
    if (!rutina) { cont.innerHTML = `<p class="texto-suave estado-vacio">Este alumno todavía no tiene una rutina asignada. Elegí un objetivo arriba para generar una.</p>`; return; }
    cont.innerHTML = rutina.dias.map((dia, di) => `
      <div class="bloque-dia">
        <div class="dia-header"><strong>${escapeHtml(dia.nombre)}</strong>
          ${esEntrenadorEditando ? `<button class="btn btn-fantasma btn-sm" style="margin-left:auto" data-agregar-ej="${di}">${icon('plus')} Agregar ejercicio</button>` : ''}
        </div>
        <div class="lista-ejercicios-dia">
          ${dia.ejercicios.map((item, ei) => {
            const ej = getExerciseById(item.ejercicioId);
            if (!ej) return '';
            return `<div class="fila-ejercicio-dia">
              <div class="fila-ejercicio-dia-icono">${icon('routine')}</div>
              <div class="fila-ejercicio-dia-info"><strong>${escapeHtml(ej.nombre)}</strong><span class="texto-suave">${item.seriesObjetivo.length} series</span></div>
              ${esEntrenadorEditando ? `<button class="btn-icono btn-icono-peligro" data-quitar-ej="${di}:${ei}">${icon('close')}</button>` : ''}
            </div>`;
          }).join('') || '<p class="texto-suave texto-pequeno">Sin ejercicios.</p>'}
        </div>
      </div>`).join('');

    $$('[data-agregar-ej]', cont).forEach(b => b.addEventListener('click', () => {
      abrirSelectorEjercicios(async (ej) => {
        rutina.dias[Number(b.dataset.agregarEj)].ejercicios.push({
          id: `ej-${Date.now()}`, ejercicioId: ej.id,
          seriesObjetivo: [{ reps: 10, peso: 0 }, { reps: 10, peso: 0 }, { reps: 10, peso: 0 }], descansoSeg: 90
        });
        await FirebaseService.guardarRutina(uid, rutina);
        renderDiasRutina(uid, rutina, esEntrenadorEditando);
        toast(`${ej.nombre} agregado.`, 'exito');
      });
    }));
    $$('[data-quitar-ej]', cont).forEach(b => b.addEventListener('click', async () => {
      const [di, ei] = b.dataset.quitarEj.split(':').map(Number);
      rutina.dias[di].ejercicios.splice(ei, 1);
      await FirebaseService.guardarRutina(uid, rutina);
      renderDiasRutina(uid, rutina, esEntrenadorEditando);
    }));
  }

  // =======================================================================
  // VISTAS DE ALUMNO
  // =======================================================================
  async function renderMiRutina() {
    const cont = $('#view-mi-rutina');
    const usuario = FirebaseService.getUsuarioActual();
    cont.innerHTML = `<p class="texto-suave">Cargando tu rutina...</p>`;
    const rutina = await FirebaseService.getRutina(usuario.uid);

    if (!rutina) {
      cont.innerHTML = `
        <div class="panel-header"><h2>¿Cuál es tu objetivo?</h2></div>
        <p class="texto-suave" style="margin-bottom:1rem">Elegí un objetivo y te armamos una rutina. Tu entrenador también puede asignarte una directamente.</p>
        <div class="grid-objetivos-inicio" id="picker-objetivo-propio"></div>`;
      $('#picker-objetivo-propio').innerHTML = Object.entries(PROGRAMAS_OBJETIVO).map(([key, p]) => `
        <button class="tarjeta-objetivo-grande" data-objetivo="${key}">
          <span class="tarjeta-objetivo-grande-icono">${icon(p.icono)}</span>
          <span class="tarjeta-objetivo-grande-nombre">${escapeHtml(p.nombre)}</span>
        </button>`).join('');
      $$('#picker-objetivo-propio [data-objetivo]').forEach(b => b.addEventListener('click', async () => {
        const rutina = generarRutinaDesdeObjetivo(b.dataset.objetivo, 'Principiante');
        await FirebaseService.guardarRutina(usuario.uid, rutina);
        await FirebaseService.actualizarFichaAlumno(usuario.uid, { objetivo: b.dataset.objetivo, nivel: 'Principiante' });
        toast('¡Rutina generada!', 'logro');
        renderMiRutina();
      }));
      return;
    }

    cont.innerHTML = `<div class="panel-header"><h2>${escapeHtml(rutina.nombre)}</h2></div><div id="dias-mi-rutina"></div>`;
    const diasCont = $('#dias-mi-rutina');
    diasCont.innerHTML = rutina.dias.map((dia, di) => `
      <div class="bloque-dia">
        <div class="dia-header"><strong>${escapeHtml(dia.nombre)}</strong>
          <button class="btn btn-primario btn-sm" style="margin-left:auto" data-empezar="${di}">${icon('play')} Empezar</button>
        </div>
        <div class="lista-ejercicios-dia">
          ${dia.ejercicios.map(item => {
            const ej = getExerciseById(item.ejercicioId);
            return ej ? `<div class="fila-ejercicio-dia"><div class="fila-ejercicio-dia-icono">${icon('routine')}</div><div class="fila-ejercicio-dia-info"><strong>${escapeHtml(ej.nombre)}</strong><span class="texto-suave">${item.seriesObjetivo.length} series</span></div></div>` : '';
          }).join('') || '<p class="texto-suave texto-pequeno">Sin ejercicios.</p>'}
        </div>
      </div>`).join('');
    $$('[data-empezar]', diasCont).forEach(b => b.addEventListener('click', () => iniciarEntrenamiento(rutina, rutina.dias[Number(b.dataset.empezar)])));
  }
  RENDERERS['mi-rutina'] = renderMiRutina;

  function iniciarEntrenamiento(rutina, dia) {
    state.sesionActiva = {
      rutinaNombre: rutina.nombre, diaNombre: dia.nombre, inicio: Date.now(),
      ejercicios: dia.ejercicios.map(item => {
        const ej = getExerciseById(item.ejercicioId);
        return {
          ejercicioId: item.ejercicioId, nombre: ej?.nombre || 'Ejercicio',
          series: item.seriesObjetivo.map(o => ({ peso: o.peso || 0, reps: o.reps || 0, completada: false }))
        };
      })
    };
    cambiarVista('sesion');
  }

  function renderSesion() {
    const cont = $('#view-sesion');
    const s = state.sesionActiva;
    if (!s) { cont.innerHTML = `<p class="texto-suave estado-vacio">No hay ningún entrenamiento en curso.</p>`; return; }
    cont.innerHTML = `
      <div class="sesion-header">
        <div><h2>${icon('play')} ${escapeHtml(s.diaNombre)}</h2><p class="texto-suave">${escapeHtml(s.rutinaNombre)}</p></div>
        <div class="sesion-header-acciones">
          <button class="btn btn-fantasma" id="btn-cancelar-sesion">${icon('close')} Cancelar</button>
          <button class="btn btn-primario" id="btn-finalizar-sesion">${icon('check')} Finalizar</button>
        </div>
      </div>
      <div id="sesion-ejercicios"></div>`;

    const ejCont = $('#sesion-ejercicios');
    function pintar() {
      ejCont.innerHTML = s.ejercicios.map((ej, ei) => `
        <div class="tarjeta-ejercicio-sesion">
          <div class="tarjeta-ejercicio-sesion-header"><h3>${escapeHtml(ej.nombre)}</h3></div>
          <table class="tabla-series"><thead><tr><th>#</th><th>Kg</th><th>Reps</th><th></th></tr></thead><tbody>
            ${ej.series.map((serie, si) => `<tr class="${serie.completada ? 'fila-serie-completa' : ''}">
              <td>${si + 1}</td>
              <td><input type="number" class="input-serie" data-ei="${ei}" data-si="${si}" data-campo="peso" value="${serie.peso}"></td>
              <td><input type="number" class="input-serie" data-ei="${ei}" data-si="${si}" data-campo="reps" value="${serie.reps}"></td>
              <td><button class="check-serie ${serie.completada ? 'check-serie-activo' : ''}" data-ei="${ei}" data-si="${si}">${icon('check')}</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>`).join('');
      $$('.input-serie', ejCont).forEach(inp => inp.addEventListener('change', () => {
        s.ejercicios[inp.dataset.ei].series[inp.dataset.si][inp.dataset.campo] = Number(inp.value) || 0;
      }));
      $$('.check-serie', ejCont).forEach(b => b.addEventListener('click', () => {
        const serie = s.ejercicios[b.dataset.ei].series[b.dataset.si];
        serie.completada = !serie.completada;
        pintar();
      }));
    }
    pintar();

    $('#btn-cancelar-sesion').addEventListener('click', () => { state.sesionActiva = null; cambiarVista('mi-rutina'); });
    $('#btn-finalizar-sesion').addEventListener('click', async () => {
      const usuario = FirebaseService.getUsuarioActual();
      const ejerciciosSesion = s.ejercicios.map(ej => ({
        ejercicioId: ej.ejercicioId, nombre: ej.nombre, series: ej.series,
        volumen: ej.series.filter(x => x.completada).reduce((sum, x) => sum + x.peso * x.reps, 0)
      }));
      if (!ejerciciosSesion.some(e => e.series.some(x => x.completada))) { toast('Marcá al menos una serie completada.', 'error'); return; }
      await FirebaseService.agregarEntrenamiento(usuario.uid, usuario.entrenadorId, {
        rutinaNombre: s.rutinaNombre, diaNombre: s.diaNombre,
        duracionSeg: Math.round((Date.now() - s.inicio) / 1000),
        ejercicios: ejerciciosSesion,
        volumenTotal: ejerciciosSesion.reduce((sum, e) => sum + e.volumen, 0)
      });
      toast('¡Entrenamiento guardado!', 'logro');
      state.sesionActiva = null;
      cambiarVista('mi-progreso');
    });
  }
  RENDERERS['sesion'] = renderSesion;

  async function renderMiProgreso() {
    const cont = $('#view-mi-progreso');
    const usuario = FirebaseService.getUsuarioActual();
    cont.innerHTML = `<p class="texto-suave">Cargando...</p>`;
    const historial = await FirebaseService.getHistorial(usuario.uid);
    cont.innerHTML = `
      <div class="panel-header"><h2>Mi progreso</h2></div>
      <div class="grid-cards-resumen" style="grid-template-columns:repeat(2,1fr)">
        <div class="card-stat"><div class="card-stat-icono">${icon('routine')}</div><div class="card-stat-valor">${historial.length}</div><div class="card-stat-label">Entrenamientos</div></div>
        <div class="card-stat exito"><div class="card-stat-icono">${icon('stats')}</div><div class="card-stat-valor">${formatNumero(historial.reduce((s, h) => s + (h.volumenTotal || 0), 0))} kg</div><div class="card-stat-label">Volumen total</div></div>
      </div>
      <div class="panel"><h3>Volumen por sesión</h3><div class="contenedor-grafico" style="margin-top:.8rem"><canvas id="grafico-mi-progreso"></canvas></div></div>`;
    renderGraficoProgresoAlumno.call(null, historial);
    const canvas = $('#grafico-mi-progreso');
    if (canvas && typeof Chart !== 'undefined') {
      new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: historial.map(h => formatFecha(h.fecha, { day: '2-digit', month: 'short' })), datasets: [{ label: 'Volumen (kg)', data: historial.map(h => h.volumenTotal || 0), borderColor: MARCA.colorAcento, backgroundColor: MARCA.colorAcento + '33', fill: true, tension: .3 }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }
  RENDERERS['mi-progreso'] = renderMiProgreso;

  // ---------------------------------------------------------------------
  // Autenticación (UI)
  // ---------------------------------------------------------------------
  function initAuthUI() {
    $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('auth-tab-activo'));
      tab.classList.add('auth-tab-activo');
      $('#form-login').hidden = tab.dataset.tab !== 'login';
      $('#form-registro').hidden = tab.dataset.tab !== 'registro';
    }));

    const chequearEmailSuperadmin = () => {
      const esSuperadmin = $('#registro-email').value.trim().toLowerCase() === EMAIL_SUPERADMIN.toLowerCase();
      const campoCodigo = $('#campo-codigo');
      if (campoCodigo) {
        campoCodigo.hidden = esSuperadmin;
        $('#registro-codigo').required = !esSuperadmin;
      }
    };
    ['input', 'change', 'keyup', 'blur'].forEach(ev => {
      $('#registro-email')?.addEventListener(ev, chequearEmailSuperadmin);
    });

    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#login-error'); err.hidden = true;
      try {
        const usuario = await FirebaseService.iniciarSesion($('#login-email').value.trim(), $('#login-password').value);
        await entrarConUsuario(usuario);
      } catch (ex) {
        err.textContent = traducirErrorFirebase(ex); err.hidden = false;
      }
    });

    $('#form-registro').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#registro-error'); err.hidden = true;
      try {
        const usuario = await FirebaseService.registrarUsuario({
          nombre: $('#registro-nombre').value.trim(),
          email: $('#registro-email').value.trim(),
          password: $('#registro-password').value,
          codigo: $('#registro-codigo').value.trim()
        });
        await entrarConUsuario(usuario);
      } catch (ex) {
        err.textContent = traducirErrorFirebase(ex); err.hidden = false;
      }
    });

    $('#btn-olvide-password').addEventListener('click', async () => {
      const email = $('#login-email').value.trim();
      if (!email) { toast('Escribí tu email arriba primero.', 'error'); return; }
      try { await FirebaseService.recuperarContrasena(email); toast('Te mandamos un email para restablecer tu contraseña.', 'exito'); }
      catch (ex) { toast(traducirErrorFirebase(ex), 'error'); }
    });

    $('#btn-cerrar-sesion').addEventListener('click', () => FirebaseService.cerrarSesion());
    $('#btn-cerrar-sesion-suspendido')?.addEventListener('click', () => FirebaseService.cerrarSesion());
    $('#btn-menu-movil')?.addEventListener('click', () => $('#sidebar').classList.toggle('sidebar-abierto'));
  }

  function traducirErrorFirebase(ex) {
    const c = ex.code || '';
    if (c.includes('email-already-in-use')) return 'Ese email ya está registrado. Probá iniciar sesión.';
    if (c.includes('invalid-email')) return 'El email no es válido.';
    if (c.includes('weak-password')) return 'La contraseña necesita al menos 6 caracteres.';
    if (c.includes('user-not-found') || c.includes('wrong-password') || c.includes('invalid-credential')) return 'Email o contraseña incorrectos.';
    if (c.includes('too-many-requests')) return 'Demasiados intentos. Probá de nuevo en un rato.';
    if (c.includes('permission-denied')) return 'No se pudo crear la cuenta por un problema de permisos. Avisale a Becker.';
    if (!c && ex.message) return ex.message;
    return 'Ocurrió un error. Probá de nuevo.';
  }

  // ---------------------------------------------------------------------
  // Inicialización
  // ---------------------------------------------------------------------
  function ocultarSplash() {
    const splash = $('#splash-screen');
    if (!splash) return;
    setTimeout(() => { splash.classList.add('splash-oculto'); setTimeout(() => splash.remove(), 600); }, 900);
  }

  function aplicarMarcaEnDOM() {
    $$('[data-marca="nombre"]').forEach(el => { el.textContent = MARCA.nombre; });
    $$('[data-marca="sufijo"]').forEach(el => { el.textContent = MARCA.sufijo; });
  }

  function init() {
    aplicarMarcaEnDOM();
    initAuthUI();

    if (!FirebaseService.configurado()) {
      ocultarSplash();
      $('#pantalla-auth').hidden = false;
      abrirModal(`
        <div class="modal-header"><h3>${icon('warning')} Falta conectar Firebase</h3></div>
        <div class="modal-body"><p>Esta app todavía no tiene un proyecto de Firebase conectado. Completá <code>js/firebase-config.js</code> con los datos de tu proyecto para poder usarla.</p></div>`, { id: 'modal-sin-firebase' });
      return;
    }

    FirebaseService.init();
    FirebaseService.onCambioSesion((usuario) => {
      ocultarSplash();
      if (!usuario) {
        ultimoUidRenderizado = null;
        $('#pantalla-auth').hidden = false;
        $('#app').hidden = true;
        return;
      }
      entrarConUsuario(usuario);
    });
  }

  let ultimoUidRenderizado = null;

  async function mostrarPantallaSuspendido() {
    $('#pantalla-auth').hidden = true;
    $('#app').hidden = true;
    $('#pantalla-suspendido').hidden = false;
  }

  async function entrarConUsuario(usuario) {
    // Un entrenador suspendido no entra.
    if (usuario.rol === 'entrenador' && usuario.estadoPago === 'suspendido') {
      mostrarPantallaSuspendido();
      return;
    }
    // Un alumno cuyo entrenador está suspendido, tampoco.
    if (usuario.rol === 'alumno') {
      const estado = await FirebaseService.getEstadoEntrenador(usuario.entrenadorId);
      if (estado === 'suspendido') { mostrarPantallaSuspendido(); return; }
    }

    // Evita re-renderizar todo si ya se está mostrando la sesión de este
    // mismo usuario: esta función se puede disparar dos veces casi al mismo
    // tiempo (una desde el formulario de login/registro, otra desde el
    // aviso de sesión de Firebase), y sin este chequeo eso duplicaba
    // botones y sus acciones (ej. "Generar código" creaba dos códigos).
    if (ultimoUidRenderizado === usuario.uid && !$('#app').hidden) return;
    ultimoUidRenderizado = usuario.uid;

    $('#pantalla-suspendido').hidden = true;
    $('#pantalla-auth').hidden = true;
    $('#app').hidden = false;
    construirSidebar(usuario);
    const vistaInicial = usuario.rol === 'superadmin' ? 'superadmin' : usuario.rol === 'entrenador' ? 'alumnos' : 'mi-rutina';
    cambiarVista(vistaInicial);
  }

  return { init, $, $$ };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
