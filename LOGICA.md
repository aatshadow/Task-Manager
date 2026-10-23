# 2day — la lógica

> Gestor de tareas y hábitos de Alex. **Un solo usuario.** Vive sobre la base de GrowthInfo
> (Supabase `elgcvevgxolquwewejqc`) pero **no se ve desde GrowthInfo**: son tablas propias
> con prefijo `hoy_`, más una capa personal sobre las tareas del portal.
> Abierto el 16-09-2026. Nada se implementa sin estar escrito aquí.

## 0 · Decisiones cerradas (Alex, 16-09-2026)

| # | Decisión |
|---|---|
| 1 | Nombre **2day** (Alex, 16-09: «la app se llama 2day»), carpeta `~/CORE/2day`, dev en **:5400**. Las tablas se quedan **`hoy_*`**: un identificador de Postgres no puede empezar por dígito sin comillas, y «hoy» es la traducción literal. |
| 2 | Se entra con **`alex@growthinfo.io`** (rol `agency`, scope `growthinfo`; es la ficha de equipo con login). **No se enlaza** la ficha «Alex» de Accelerator Launch: «no soy yo». |
| 3 | De GrowthInfo entran: **asignadas a mí + en `assignees` + creadas por mí + las que sigo a mano**. La RLS ya limita a GrowthInfo (sin cabecera `x-portal`, `pc_portal_declarado()` cae en `growthinfo`). |
| 4 | **Sin cupo de huecos en Hoy.** Lo que no se hizo pasa a «Siguiente» al reiniciar el día, y el día apunta planificadas/hechas. |
| 5 | **Eisenhower fijo** (4 cuadrantes) con **etiqueta y color editables**. Al crear una tarea de GrowthInfo desde 2day se traduce una vez a `tasks.priority` (q1→urgente, q2→alta, q3→media, q4→baja); después van separados. |
| 6 | **Calendario** con vistas **día / semana / mes**, solo tareas. |
| 7 | Estadísticas: hechas por día/proyecto/categoría/cuadrante **y un gráfico lineal temporal de creadas vs hechas por día**. |
| 8 | **Un solo sitio para tareas y hábitos: este.** El JUEGO de SYSTEMA (§25) deja de llevar tareas y hábitos (se retira de allí más adelante; no se migran datos). |
| 9 | **Móvil primero** (PWA instalable); en escritorio, la misma columna centrada. |
| 10 | Estilo: **exactamente el del mockup** (negro cálido, naranja, tarjetas redondeadas con degradado suave, números grandes, nav inferior). Ver §6. |

## 1 · El principio: misma fila, dos puertas

Una tarea de GrowthInfo **no se copia**: 2day lee y escribe **la misma fila de `public.tasks`** que
ve el portal. Es el patrón que ya funciona en `✅│task-afiliados` (Discord es «una segunda puerta a
las mismas filas»). No hay sincronizador, luego no hay eco ni deriva.

Lo que `tasks` no sabe guardar de mí (cuadrante, para qué día la he planificado, orden, horas del
día, «la sigo», notas privadas) va en **`hoy_capa`**, una fila por tarea keyed por su id, sea la
tarea personal o del portal. Nadie del portal la ve (RLS por `owner_id`).

**Regla heredada del portal, obligatoria:** mover una tarea de GrowthInfo escribe **los dos ejes**
en la misma escritura — `stage_id` (la columna de SU cliente) y `status` (el vocabulario común) —
con la misma lógica que `cambiosAlMover()` de `portal-core/src/portal/portalTareas.js`: si la
etapa tiene clave del vocabulario (`todo·in_progress·review·blocked·done`) el estado la sigue;
`completed` = etapa terminal. Completar desde 2day = mover a la etapa `done` de su tablero.

## 2 · Modelo de datos (`sql/2026-09-16-hoy.sql`)

Todas las tablas nuevas: `owner_id uuid default auth.uid()`, RLS `owner_id = auth.uid()` en los
cuatro verbos, `revoke all from anon` (la RLS es la puerta, el GRANT es el muro).

| Tabla | Qué guarda |
|---|---|
| `hoy_ajustes` | Una fila: `hora_reinicio` (04:00), `dias_nevera` (30), `dias_bandeja` (7), `cuadrantes` jsonb (`{q1:{nombre,color},…}`). |
| `hoy_proyectos` | Proyectos propios: nombre, color, icono (emoji), posicion, `archivado_at`. Los **clientes de GrowthInfo entran solos** como proyectos «de cliente» leídos de `clients` (no se duplican). |
| `hoy_categorias` | `clave` estable + nombre + color + posicion + `archivado_at`. Se siembran las 7 del portal con sus claves (`proyecto·soporte·contenido·ventas·ia·afiliados·general`) para que una tarea del portal se pinte nativa. Las tuyas se añaden; una tarea del portal solo admite las 7 (check del portal). |
| `hoy_pipelines` · `hoy_etapas` | Varios tableros; etapas con `clave`, color, posicion, `es_terminal`. Solo para tareas personales. Se siembra «Principal» con las 5 etapas del vocabulario. |
| `hoy_tareas` | **Solo las personales**: titulo, descripcion, proyecto_id, categoria (clave), pipeline_id, etapa_id, estado, inicio, vence, responsable_id (`team_members`), hecha, hecha_en, posicion, `archivado_at`. |
| `hoy_capa` | La capa personal de **cualquier** tarea: `tarea_id` (id de `hoy_tareas` o de `tasks`, sin FK), `origen` (`hoy`/`portal`), cuadrante (`q1..q4`), `hoy_para` (date), orden, hora_inicio, hora_fin, seguida, notas, **`repetir`** (regla, §4.1; `sql/2026-09-16-repetir.sql`). |
| `hoy_dias` | Cierre del día: fecha, planificadas, hechas, nota. Lo único que no se puede derivar después. |
| `hoy_habitos` · `hoy_marcas` | Hábito: nombre, icono, color, cadencia (`diario`/`dias`/`semana`), `dias` (1=L…7=D), `veces_semana`, `archivado_at`. Marca: una por (hábito, fecha). |
| `hoy_plantillas` · `hoy_plantilla_items` | Ítem: titulo, descripcion, categoria, cuadrante, grupo (fase), `dias_offset`, posicion. |

**La vista `hoy_todas`** (`security_invoker`) es lo único que lee la app para listar: une
`hoy_tareas` + las filas de `tasks` que me tocan (decisión 3), ambas con la misma forma, con la
capa ya pegada. Columnas: `id, origen, titulo, descripcion, proyecto_id, client_id, categoria,
pipeline_id, etapa_id, estado, inicio, vence, responsable_id, participantes, hecha, hecha_en,
archivado_at, created_at, updated_at, posicion, cuadrante, hoy_para, orden, hora_inicio, hora_fin,
seguida, notas, prioridad_portal, fase, repetir`. La app escribe en `hoy_tareas` o en `tasks` según `origen`.

**Funciones:**
- `hoy_mi_ficha()` → id de mi `team_members` (la que tiene `user_id = auth.uid()`).
- `hoy_sembrar()` → idempotente: ajustes + 7 categorías + pipeline Principal con 5 etapas.
- `hoy_reiniciar_dia(p_hoy date)` → para cada `hoy_para < p_hoy`: apunta `hoy_dias(planificadas, hechas)` y quita `hoy_para` a las **no hechas** (las hechas conservan la fecha: son historia).

**Realtime:** `tasks` entra en la publicación `supabase_realtime` para que un cambio hecho en el
portal aparezca en 2day sin recargar. Las `hoy_*` no lo necesitan (un solo usuario); se recarga al
volver el foco.

## 3 · «Siempre limpio» — las reglas

1. **La única lista que se ve al abrir es Hoy.** Todo lo demás está a un toque.
2. **Sin cupo.** Planificas lo que quieras; **lo que no se hizo no se queda en rojo**: al reiniciar
   el día (`hora_reinicio`, por defecto 04:00) vuelve a «Siguiente» y el día apunta
   *planificadas N · hechas M*. Ese cociente es la estadística de sobrecarga.
3. **Bandeja de entrada**: captura en un campo, sin clasificar (sin proyecto ni cuadrante). Lo que
   lleva más de `dias_bandeja` sin triar se enciende.
4. **Nevera**: una tarea sin tocar `dias_nevera` días, sin fecha y sin estar en Hoy, se va a «Algún
   día» y desaparece de las listas. La **revisión** las enseña: sigue o muere. Es derivada de
   `updated_at`, no un estado.
5. **«Atrasada» es derivada, nunca un estado** (`vence < hoy` y no hecha). Misma regla que el portal.
6. Un hábito **no se borra: se archiva**. Un día que no tocaba **no es un fallo**.

El «hoy» de la app es `hoyLocal(hora_reinicio)`: a las 02:00 sigue siendo ayer hasta las 04:00.

## 4 · Qué se puede hacer con una tarea

| Acción | Personal | De GrowthInfo |
|---|---|---|
| Crear | `hoy_tareas` + `hoy_capa` | `tasks` con `client_id`, `pipeline_id` = tablero por defecto del cliente, `stage_id` = etapa `todo`, `priority` traducida del cuadrante, `created_by` = yo, `visibilidad` interna; + `hoy_capa` |
| Editar título/desc/fechas | `hoy_tareas` | `tasks` (`title/description/start_date/due_date`) |
| Categoría | cualquiera de `hoy_categorias` | solo las 7 del portal |
| Proyecto | `proyecto_id` | `client_id` (no se cambia de cliente desde 2day) |
| Cuadrante · Hoy · orden · horas · notas · seguir · **repetir** | `hoy_capa` | `hoy_capa` |
| Mover de etapa / completar | `etapa_id` + `estado` + `hecha` (dos ejes) | `stage_id` + `status` + `completed` (dos ejes, `cambiosAlMover`) |
| Responsable | `responsable_id` (informativo: no ven 2day) | `assignee_id` (real: lo ven en su portal) |
| Archivar | `archivado_at` | `archived_at` |
| Borrar | sí | sí (Alex es dirección y `p_tasks_del` lo permite; desaparece también del portal. Decidido el 16-09: «déjame poder hacerlo») |

### 4.1 · Tareas que se repiten (Alex, 16-09-2026)

Una tarea puede llevar una **regla de repetición** en su capa (`hoy_capa.repetir`), sea personal o
de GrowthInfo. Vocabulario, fijo: `diario` (cada día) · `laborables` (cada día entre semana) ·
`semanal` (cada semana, mismo día) · `mensual` (cada mes, mismo número; si el mes no lo tiene, el
último) · `cada:N` (cada N días, N de 1 a 999; el selector propone 3).

**El modelo es el de un gestor de tareas, no el de un calendario:** sólo existe la **próxima**
ocurrencia. No se generan copias a futuro y no hay «serie» que editar; cada ocurrencia es una
tarea normal con la regla pegada.

1. **Al completar** una tarea con regla (por cualquier puerta: marca, hoja, kanban a `done`, Hoy),
   la capa de datos crea la **siguiente**: mismo título, descripción, proyecto o cliente, categoría,
   cuadrante, horas, responsable y regla; `vence` = la primera fecha de la serie **posterior a
   `max(vence, hoy)`** (completar tarde no engendra una atrasada; completar pronto no duplica la
   de mañana); `hoy_para` = ese mismo día (que aparezca en Hoy cuando toque); un período
   (`inicio`) se desplaza lo mismo que `vence`. Sin `vence`, la serie ancla en hoy.
2. **Sin duplicar:** si ya existe una tarea viva con el mismo título, la misma regla y ese `vence`,
   no nace otra (des-completar y volver a completar no engendra dos).
3. **Des-completar no borra** la siguiente ya nacida: es una tarea como cualquiera; se borra a mano.
4. **Saltar:** desde la hoja, «Saltar → <fecha>» mueve ESA tarea a la siguiente fecha de la serie sin
   marcarla hecha (no nace otra).
5. **Quitar la regla** (Nunca) deja la tarea como está; sólo deja de engendrar.
6. Poner una regla a una tarea sin `vence` le pone `vence = hoy` (la serie necesita ancla).

La regla se ve como chip en la hoja («Se repite · cada semana») y como icono ↻ en las filas.

**Explorar GrowthInfo**: dentro de Tareas, una lista de todas las tareas vivas de GrowthInfo por
cliente (lo que la RLS deje ver) para **seguir** o **asignarme** una. Seguir = fila en `hoy_capa`
con `seguida = true`; desde ahí entra en la vista.

**Plantillas**: instanciar = plantilla + proyecto (propio o cliente) + fecha base opcional →
nacen todos los ítems (vence = fecha base + `dias_offset` si hay fecha). Si el proyecto es un
cliente, nacen en `tasks`. Las 2 plantillas de la agencia (`task_templates`) se listan también,
solo lectura.

## 5 · Pantallas y navegación

Nav inferior de 5: **Hoy · Tareas · Calendario · Hábitos · Stats**. Avatar arriba a la derecha →
**Ajustes**. Botón «+» naranja flotante en todas → **captura rápida** (título y listo; va a Bandeja;
opcionalmente proyecto/cuadrante/fecha desplegando).

| Pantalla | Qué enseña |
|---|---|
| **Hoy** | «Hola Alex» + «N tareas pendientes». Tarjeta grande naranja-degradado con la **primera de Hoy** (o la siguiente con hora). 4 números grandes: Hechas hoy · En Hoy · Atrasadas · Bandeja. Lista de Hoy (marcar hecha con un toque, reordenar). Hábitos que tocan hoy con su marca. Al abrir, si hay días sin cerrar, ejecuta `hoy_reiniciar_dia` y avisa «ayer: 7 planificadas · 4 hechas». |
| **Tareas** | Pestañas: **Bandeja** (sin triar) · **Siguiente** (todo lo vivo no hecho, agrupable por proyecto/cuadrante/categoría, filtro por proyecto y por responsable) · **Tableros** (kanban por pipeline propio; los tableros de cliente se ven con sus etapas del portal) · **Explorar GrowthInfo** · **Nevera**. Toque en una tarea → hoja de detalle (bottom sheet) con todos los campos, comentarios si es del portal. |
| **Calendario** | Día (timeline por horas como el «Ongoing» del mockup; las sin hora arriba como «todo el día»; línea naranja de «ahora»; **el día se organiza arrastrando, §5.1**) · Semana (7 columnas) · Mes (rejilla con puntos; toque → lista del día). Cabecera con mes y flechas como el mockup. Solo tareas (por `vence`, y por `inicio→vence` si hay período). Arrastrar/asignar fecha desde la hoja. |
| **Hábitos** | Los de hoy con marca grande; rejilla de las últimas 4 semanas por hábito; racha; cumplimiento de la semana. Alta/edición con cadencia. |
| **Stats** | Selector 7 · 30 · 90 días. **Gráfico lineal temporal: creadas vs hechas por día.** Hechas por proyecto, por categoría, por cuadrante (barras). Sobrecarga: planificadas vs hechas por día (de `hoy_dias`). Racha de días con ≥1 hecha. Hábitos: cumplimiento por semana. |
| **Ajustes** | Proyectos · Categorías · Pipelines y etapas · Cuadrantes (etiqueta y color) · Plantillas (crear/editar/instanciar) · Día (hora de reinicio, nevera, bandeja) · Cuenta (salir). |
| **Acceso** | Email + contraseña (Supabase Auth). Sesión persistida. |

### 5.1 · Organizar el día arrastrando (Alex, 16-09-2026)

En la vista **Día** la hora de una tarea se pone **con el dedo**, no desde la hoja:

1. **Levantar.** Con el dedo, pulsación sostenida (~300 ms sin moverse) sobre una tarea de «Todo el
   día» o del timeline: vibra y se levanta. Con ratón, basta tirar de ella. Moverse antes de que
   levante es un scroll, no un arrastre: el gesto se lo queda el navegador.
2. **Arrastrar.** La tarjeta fantasma sigue al dedo. Sobre el timeline se **imanta a 5 minutos**:
   una línea naranja cruza la pista a la altura del borde superior y la hora exacta (`09:35`) se
   pinta en el margen de las horas, tapando la etiqueta que hubiera debajo. Cerca del borde de la
   pantalla, la página se desplaza sola. Escape cancela; soltar fuera de la pista y de «Todo el
   día» también.
3. **Soltar en la pista** escribe `hora_inicio` (capa personal, `programar`). Si la tarea **ya tenía
   duración** (`hora_fin > hora_inicio`), se desplaza entera: `hora_fin` se mueve lo mismo. Si **no
   la tenía**, se escribe `hora_inicio` (y `hora_fin` a null) y aparece pegado a la tarjeta el
   **selector rápido de duración**: `5m · 15m · 30m · 45m · 1h · 1h30 · 2h`. Elegir escribe
   `hora_fin`. Tocar fuera lo cierra sin escribir: la tarea se queda con hora de inicio y se pinta
   de una hora, como siempre (`tramoDe`).
4. **Soltar una tarjeta del timeline sobre «Todo el día»** le quita la hora (`hora_inicio` y
   `hora_fin` a null). Es el gesto inverso; la zona se enciende mientras hay algo en el aire.
5. Límites: de 6:00 a 24:00 menos la duración. Lo demás no cambia: ni `vence`, ni `hoy_para`.

Es una escritura optimista por el `usarGuardar` de la casa: la tarjeta aterriza al instante y, si
la base dice que no, vuelve donde estaba y avisa.

### 5.2 · Año y Gantt, con los hitos (Alex, 22-10-2026)

El Calendario gana dos vistas: **Día · Semana · Mes · Año · Gantt**.

- **Año**: los 12 meses en miniatura. Hoy en naranja, punto bajo los días con tareas, **días con hito en
  aro ámbar**. Debajo, «Hitos de AAAA» en orden con «en 3 días» / «hecho». Toque en un día o en un hito →
  ese día en la vista Mes. Flechas = año anterior/siguiente.
- **Gantt**: 9 semanas (desde el lunes anterior al de la fecha), las flechas saltan 4. Una fila por tarea
  con `vence`, agrupadas por proyecto; barra de `inicio` a `vence`, **rombo** si es de un solo día; las
  hechas, tachadas y apagadas. **Los hitos son rayas verticales ámbar de arriba abajo en su día**, con la
  etiqueta (frente) arriba en carriles que no se pisan; la raya de hoy, naranja. Columna de nombres fija y
  días con scroll horizontal. Toque en una fila → su hoja. Lógica pura en `calendario.js`
  (`filasGantt`, `tramoGantt`, `hitosPorDia`, `carrilesHitos`).

### 5.3 · Stats a cero sin borrar nada (Alex, 22-10-2026)

«No lo he usado mucho, lo quiero a 0 a partir de ahora.» `hoy_ajustes.stats_desde` (date, null = desde
siempre) es la fecha desde la que cuentan Stats y el Overview: los rangos no bajan de ahí, la racha ignora
lo hecho antes y las marcas anteriores no entran en el cumplimiento. **No se borra ninguna tarea ni marca.**
Se cambia en Ajustes → Día → «Stats desde». El mismo día el Zero Agent Challenge se reinició a
**22-10-2026 → 19-01-2027** (antes 23-09 → 21-12). Para deshacer: `sql/2026-10-22-reinicio.sql`.

## 6 · Diseño — el mockup, en tokens

- Fondo página `#151515`; tarjeta `#1f1f1f`; tarjeta elevada `#262626`; nav `#191919`.
- **Tarjeta cálida** (la destacada): `linear-gradient(135deg, #4a2a17 0%, #2a1b13 55%, #1f1f1f 100%)` con brillo naranja suave arriba-izquierda.
- **Tarjeta naranja** (lo activo/ahora): `#f26b1b` → texto `#fff6ef`.
- Acento `#f26b1b`; acento claro `#ff8c42`; acento apagado `rgba(242,107,27,.18)`.
- Texto `#f5f3ef`; secundario `#a8a39c`; terciario `#6f6b66`; líneas `rgba(255,255,255,.06)`.
- Radios: tarjetas **24px**, botones y chips **999px**, campos 14px. Sombra mínima; el relieve lo da el degradado.
- Tipografía: **Inter Tight variable** (como el portal), números grandes 34–38px peso 600, títulos 22px peso 600, cuerpo 15px, secundario 13px.
- Iconos: `lucide-react`, trazo 1.75, 22px en la nav; activo en naranja con punto debajo.
- Calendario: día actual en círculo naranja relleno; nombres de día en secundario.
- Timeline del día: horas a la izquierda (13px secundario), tarjetas a la derecha, línea naranja fina con punto para «ahora».
- Movimiento: `framer-motion`, entradas suaves 180–220ms, hojas (bottom sheet) con arrastre para cerrar.
- Móvil primero: ancho de columna máx. **430px** centrada en escritorio, con el fondo de página alrededor. Área segura inferior para la nav (env(safe-area-inset-bottom)).

## 7 · Contrato de la capa de datos (`src/datos/*`)

Todo devuelve objetos en **el vocabulario de la pantalla** (español, camelCase) y traduce a
columnas en un solo sitio por tabla. Errores: `throw new ErrorHoy(mensaje, causa)`.

```
fechas.js       hoyLocal(horaReinicio) · sumarDias · diasEntre · semanaDe · mesDe · aISO
supabase.js     supabase (anon key + sesión), isConfigured
catalogos.js    cargarAjustes · guardarAjustes · sembrar
                cargarProyectos · crearProyecto · actualizarProyecto · archivarProyecto
                cargarClientes (clients de GrowthInfo, solo lectura) · cargarEquipo (team_members activos)
                cargarCategorias · crearCategoria · actualizarCategoria · archivarCategoria
                cargarPipelines (con etapas) · crearPipeline · crearEtapa · actualizarEtapa · borrarEtapa · reordenarEtapas
                cargarTablerosDeCliente(clientId) (task_pipelines + task_stages del portal)
tareas.js       cargarTodas({ incluirArchivadas }) → [Tarea]           (de hoy_todas)
                cargarExplorar()  → tareas vivas de GrowthInfo por cliente (de tasks)
                crear({ titulo, origen:'hoy'|'portal', proyectoId | clientId, categoria, cuadrante, vence, inicio, hoyPara, responsableId, descripcion })
                actualizar(tarea, cambios)   // decide tabla por tarea.origen
                mover(tarea, etapa)          // dos ejes, ambas tablas
                completar(tarea, hecha=true) // = mover a la terminal de su tablero
                capa(tareaId, origen, cambios) // cuadrante, hoyPara, orden, horaInicio, horaFin, seguida, notas
                planificarHoy(tarea, fecha|null) · programar(tarea, { horaInicio, horaFin }) · seguir(tarea, si) · archivar(tarea, si) · borrar(tarea)
                saltar(tarea)                // a la siguiente fecha de su regla, sin completar (§4.1)
repetir.js      puro: REGLAS · esRegla · nombreRegla(regla) · siguienteFecha(regla, ancla, despuesDe) · reglaCadaN(n)
                reiniciarDia(hoy) · cargarDias(desde, hasta)
                cargarComentarios(taskId) · comentar(taskId, texto)   // solo portal
                esAtrasada(t, hoy) · esNevera(t, ajustes, hoy) · esBandeja(t)
habitos.js      cargarHabitos · crearHabito · actualizarHabito · archivarHabito
                cargarMarcas(desde, hasta) · marcar(habitoId, fecha, si)
                tocaHoy(h, fecha) · racha(h, marcas, hoy) · cumplimientoSemana(h, marcas, semana)
plantillas.js   cargarPlantillas (propias + agencia) · crearPlantilla · actualizarPlantilla · borrarPlantilla
                guardarItems(plantillaId, items) · instanciar(plantilla, { proyectoId | clientId, fechaBase })
estadisticas.js puro: seriesCreadasHechas(tareas, desde, hasta) · porProyecto · porCategoria · porCuadrante · rachaDias · sobrecarga(dias)
```

`useDatos()` (contexto): `{ sesion, yo (team_member), ajustes, proyectos, clientes, equipo, categorias,
pipelines, tareas, habitos, marcas, hoy, recargar(), abrirTarea(id), nuevaTarea(prefill) }`.
Realtime en `tasks` → `recargar()` con debounce. `visibilitychange` → `recargar()`.

## 8 · Verificación

- `tests/forma.mjs`: la vista y las funciones existen, las `hoy_*` no tienen GRANT a `anon`, la RLS está activa.
- `tests/e2e-alex.mjs`: login real con la cuenta del vault (nunca en el repo), crea una tarea personal, una de GrowthInfo en `kiki`, la mueve a `done` y comprueba en `tasks` que `stage_id` es la etapa `done` de kiki **y** `status='done'` **y** `completed=true`; la sigue/desigue; la archiva; limpia lo creado.
- `npm run build` sin errores. Comprobación visual en Chrome a 390px contra el mockup.

## 9 · Fuera de v1

Timer por tarea · dependencias · sprints · notificaciones push · multiusuario · migrar datos del JUEGO.

## 10 · El Protocolo — 2day como centro de control del reto (Alex, 22-09-2026)

> El 22-09 Alex abre dos meses de sprint en GrowthInfo (cinco frentes, dos lanzamientos en tres
> días) y dicta tres documentos: la **Rutina del Operador ajustada** (04:30), el **Protocolo de
> Forja** (entreno semanal) y la **dieta cetogénica adaptativa**. Los tres son la conducta de los
> próximos 90 días: el **Zero Agent Challenge**. El mandato: 2day deja de ser «una lista de
> tareas» y pasa a ser el sitio donde se ve el día entero, se marca lo que toca y se mide el reto.
> Diagnóstico previo (22-09): 4 hábitos, 5 marcas en total, y los días 17, 18 y 19 cerrados con
> 0 hechas. La app funcionaba, pero no era el sitio al que Alex volvía.

### 10.0 · Decisiones cerradas (Alex, 22-09-2026; las marcadas «a solas» las cerró CORE sin preguntar, por mandato)

| # | Decisión |
|---|---|
| 1 | **La rutina NO son tareas.** Veinte tareas idénticas cada día reventarían la lista y la estadística de sobrecarga. Es un **raíl fijo de bloques con hora** (`hoy_bloques`) que se pinta de fondo en la vista Día; las tareas se arrastran **dentro** de un bloque. Modo túnel: se decide qué entra en cada bloque, nunca el bloque. |
| 2 | Los hábitos ganan `hora`, `grupo`, `tipo` (`hacer` / `evitar` / `medir`), `unidad`, `objetivo`, `bloque_id`, `descripcion` y `plan` (jsonb por día de semana ISO, para el entreno). Un `evitar` se marca igual que un `hacer` (marcado = cumplido); un `medir` cuenta como hecho cuando tiene `valor`. |
| 3 | `hoy_marcas` gana `valor numeric` (lo que se mide: kg, horas). La `nota` que ya existía sirve para pesos y rondas del entreno. |
| 4 | `hoy_retos`: una fila **«Zero Agent Challenge»**, `inicio` **2026-09-23** (arranca a las **04:30**), 90 días → `fin` **2026-12-21**. Día del reto = días desde `inicio` + 1, tope 90. Antes del inicio la app enseña «empieza mañana a las 04:30»; después del fin, «90/90 · completado». |
| 5 | `hoy_dias` gana `habitos_tocaban` y `habitos_hechos` (la adherencia del día). `hoy_reiniciar_dia` los apunta al cerrar el día, igual que planificadas/hechas. |
| 6 | `hoy_hitos` (nombre, frente, fecha nullable, `client_id` nullable, hecho): los lanzamientos de los frentes de GrowthInfo. Se ven en Hoy («en 3 días», rojo si ≤ 3) y se editan en Ajustes. |
| 7 | La tarjeta destacada de Hoy pasa a ser **«AHORA: ‹bloque› · quedan Xh Ym · siguiente ‹bloque› HH:MM»** con las tareas de ese bloque debajo. Si el día no tiene bloque (protocolo desactivado), cae a la lógica de §5 (la primera de Hoy). |
| 8 | Timeline del Día de **04:00 a 24:00** (antes 06:00): el día empieza a las 04:30. El bloque de Sueño (22:00–04:30) cruza medianoche y se pinta en dos trozos. |
| 9 | **Escritorio ≥ 1024 px**: raíl de navegación a la izquierda (fuera la nav inferior), contenido ancho, la hoja de detalle como **panel lateral derecho**; Hoy = **Día \| Hábitos \| Frentes**; atajos `n` (nueva), `1–5` (pestañas), `t` (Hoy), `Esc` (cierra). Mismo motor, misma capa de datos: CSS grid + un hook, no una segunda app. En móvil no cambia nada. |
| 10 | *(a solas)* Los dailies (socio 13:00, comercial 14:15) pasan a **bloques de lunes a viernes**. Las tareas «Daily con Pere» y «Daily con Adri» (regla `diario`) se **archivan**, no se borran: el bloque y el hábito ya los cuentan. |
| 11 | Los 4 hábitos existentes se conservan con sus marcas: «45 min training» se **renombra «Entreno»** y recibe el plan; «Leer protocolo», «No redbull» (pasa a tipo `evitar`) y «Journal process to 520424,26$» se recolocan en su grupo y hora. |
| 12 | Compra semanal y meal prep son **tareas con regla `semanal`** (domingo), no hábitos: tienen lista, duran dos horas y se pueden mover. |
| 13 | *(a solas)* **Hora maestra = la «Rutina del Operador ajustada»** (comida 1 ANTES del gym, gym 06:40–07:30). Los otros dos documentos decían 05:15–06:00 y «comida 1 a las 06:00 post-entreno»: no cuadraban entre sí; del Protocolo de Forja se toma sólo el **contenido** de cada día. Miércoles sin gym y spa completo (Alex, 22-09: «los miércoles haremos sesión de sauna más larga y ya»); sábado caminata + movilidad; domingo descanso + meal prep. |
| 14 | *(a solas)* **Fin de semana**: se conservan calibración, comidas, spa, planificación y apagado (son diarios); los bloques de trabajo y los dailies son L–V. La rutina dictada no decía nada del fin de semana; el entreno sí. |
| 15 | *(a solas)* Objetivo de sueño **6,5 h** (22:00 → 04:30, lo que dicta la rutina). Se mide, no se juzga. |
| 16 | *(a solas)* En la **adherencia** un hábito de cadencia `semana` («3 veces por semana») sólo cuenta los días en que se marca: no puede penalizar cada día. `hoy_adherencia_dia(fecha)` es la única fórmula (la app la replica en `adherencia()`); `hoy_reiniciar_dia` cierra también los días que sólo tienen marcas (sin tareas planificadas) y completa la adherencia de un día cerrado con 0/0. |
| 17 | *(a solas)* `hoy_sembrar_protocolo(p_restaurar)`: sin `p_restaurar` crea lo que falte y sólo rellena lo vacío (se puede llamar en cada arranque); con `p_restaurar = true` («Restaurar el protocolo») vuelve a dejar bloques y hábitos como dicta §10. Las marcas no se tocan nunca. |

### 10.1 · Bloques — el raíl del día (`hoy_bloques`)

Columnas: `nombre`, `fase`, `inicio time`, `fin time`, `dias smallint[]` (ISO, 1=L … 7=D), `icono`,
`color`, `posicion`, `activo`, `archivado_at`. Un bloque cuyo `fin` es menor que su `inicio` cruza
medianoche. Se siembran exactamente estos 22 (`hoy_sembrar_protocolo()`, idempotente por nombre):

| Fase | Bloque | Horas | Días |
|---|---|---|---|
| calibracion | Activación del Emperador (agua con sal, luz roja, «Soberanía Inmutable») | 04:30–04:45 | 1-7 |
| calibracion | Meditación de No-Mente (20') + Visualización del día (25') | 04:45–05:30 | 1-7 |
| nutricion | Comida 1 — combustible (huevos, aguacate, salmón, MCT, café) | 05:30–06:15 | 1-7 |
| cuerpo | Preparación y tránsito al gimnasio | 06:15–06:40 | 1,2,4,5 |
| cuerpo | Entrenamiento de alta intensidad | 06:40–07:30 | 1,2,4,5 |
| cuerpo | Caminata rápida sin música | 06:40–07:10 | 6 |
| cuerpo | Regeneración: ducha de hielo 2' + café | 07:30–08:00 | 1-7 |
| ofensiva | Inmersión total — Lanzamiento 1 | 08:00–11:00 | 1-5 |
| ofensiva | Recarga cerebral (Ojo de la Tormenta) | 11:00–11:15 | 1-5 |
| ofensiva | Inmersión — tareas críticas y métricas | 11:15–12:00 | 1-5 |
| nutricion | Comida 2 + calibración (sauna rápida o ducha de contraste) | 12:00–13:00 | 1-7 |
| reuniones | Daily con el Socio | 13:00–14:00 | 1-5 |
| reuniones | Pausa estratégica | 14:00–14:15 | 1-5 |
| reuniones | Daily con el Director Comercial | 14:15–15:15 | 1-5 |
| nutricion | Comida 3 — Nutrición del General (última ingesta, empieza el ayuno) | 15:15–16:00 | 1-7 |
| consolidacion | Ejecución de tareas críticas | 16:00–18:30 | 1-5 |
| cuerpo | Movilidad y estiramientos profundos | 16:00–16:30 | 6 |
| nutricion | Meal prep de la semana | 16:00–18:00 | 7 |
| cuerpo | Protocolo de Spa (miércoles: completo, 3 ciclos) | 18:30–19:30 | 1-7 |
| consolidacion | Planificación del mañana | 19:30–20:00 | 1-7 |
| apagado | Desconexión total | 20:00–22:00 | 1-7 |
| apagado | Sueño de alta performance | 22:00–04:30 | 1-7 |

**Fases y color** (tokens nuevos en `tokens.css`, nada de hex sueltos): `calibracion` violeta suave ·
`nutricion` verde · `cuerpo` naranja · `ofensiva` naranja intenso (el acento) · `reuniones` azul ·
`consolidacion` ámbar · `apagado` gris. En el timeline se pintan al 12 % de opacidad; el bloque
actual, un punto más encendido.

**Bloque actual** = el que contiene la hora de ahora en un día en que toca (`dias`). El de Sueño
contiene tanto las 23:30 como las 03:00. Si dos se solapan (no ocurre en la siembra), gana el de
menor `posicion`. **Siguiente** = el primero cuyo `inicio` es posterior a ahora, hoy; si no queda
ninguno, el primero de mañana.

### 10.2 · Hábitos — el checklist del operador

Se siembran ordenados por hora dentro de su grupo. Los cuatro existentes se reutilizan (decisión 11).
`hacer` = marcar es cumplir · `evitar` = marcar es haber resistido · `medir` = escribir el valor es cumplir.

| Grupo | Hábito | Tipo | Hora | Días | Bloque |
|---|---|---|---|---|---|
| Calibración | Levantarse a las 04:30 | hacer | 04:30 | 1-7 | Activación del Emperador |
| Calibración | Agua con sal del Himalaya | hacer | 04:30 | 1-7 | Activación del Emperador |
| Calibración | Luz roja + «Soberanía Inmutable» | hacer | 04:35 | 1-7 | Activación del Emperador |
| Calibración | Leer protocolo *(existente)* | hacer | 04:40 | 1-7 | Activación del Emperador |
| Calibración | Peso | medir (kg) | 04:40 | 1-7 | Activación del Emperador |
| Calibración | Horas de sueño | medir (h, objetivo 6,5) | 04:40 | 1-7 | Activación del Emperador |
| Calibración | Meditación 20' | hacer | 04:45 | 1-7 | Meditación + Visualización |
| Calibración | Visualización del día 25' | hacer | 05:05 | 1-7 | Meditación + Visualización |
| Cuerpo | Entreno *(era «45 min training»; plan por día, §10.3)* | hacer | 06:40 | 1,2,4,5 | Entrenamiento de alta intensidad |
| Cuerpo | Caminata 30' sin música | hacer | 06:40 | 6 | Caminata rápida sin música |
| Cuerpo | Ducha de hielo 2' | hacer | 07:30 | 1-7 | Regeneración |
| Cuerpo | Movilidad 30' | hacer | 16:00 | 6 | Movilidad y estiramientos |
| Cuerpo | Spa (miércoles: completo, 3 ciclos) | hacer | 18:30 | 1-7 | Protocolo de Spa |
| Nutrición | Comida 1 | hacer | 05:30 | 1-7 | Comida 1 |
| Nutrición | Comida 2 | hacer | 12:00 | 1-7 | Comida 2 |
| Nutrición | Sin azúcar ni carbohidratos | evitar | 12:00 | 1-7 | Comida 2 |
| Nutrición | No redbull *(existente → evitar)* | evitar | 12:00 | 1-7 | Comida 2 |
| Nutrición | Comida 3 | hacer | 15:15 | 1-7 | Comida 3 |
| Nutrición | Ayuno cerrado desde las 16:00 | evitar | 16:00 | 1-7 | Comida 3 |
| Trabajo | Inmersión 3 h sin distracciones | hacer | 08:00 | 1-5 | Inmersión total — Lanzamiento 1 |
| Trabajo | Daily con el Socio | hacer | 13:00 | 1-5 | Daily con el Socio |
| Trabajo | Daily con el Director Comercial | hacer | 14:15 | 1-5 | Daily con el Director Comercial |
| Trabajo | Planificar el mañana | hacer | 19:30 | 1-7 | Planificación del mañana |
| Trabajo | Journal process to 520424,26$ *(existente)* | hacer | 19:45 | 1-7 | Planificación del mañana |
| Apagado | Desconexión total a las 20:00 (pantallas de trabajo) | evitar | 20:00 | 1-7 | Desconexión total |
| Apagado | En la cama a las 22:00 | hacer | 22:00 | 1-7 | Sueño de alta performance |

Los hábitos de comida llevan en `descripcion` el plato de §10.4. Un hábito con `dias` sigue la
regla de §3.6: un día que no toca no aparece ni cuenta.

### 10.3 · Plan de entreno (`plan` jsonb del hábito Entreno, clave = día ISO)

Cada entrada es `{ titulo, lineas: [] }`. Al abrir Entreno en Hoy se enseña la de hoy y se admite una
nota (pesos, rondas) que va a `hoy_marcas.nota`.

| Día | Título | Sesión |
|---|---|---|
| 1 | Leopardo — explosividad | calentamiento 5' (cuerda + movilidad) · 4 rondas: saco 3' explosivo / burpees 12 / kettlebell swings 15 / descanso 90'' · enfriamiento 10' |
| 2 | Tanque — fuerza bruta | calentamiento 5' · press banca 4×6-8 · sentadilla con barra 4×6-8 · peso muerto rumano 4×8-10 · descanso 2' entre series · enfriamiento 5' |
| 3 | Arma biológica — recuperación | sin gimnasio; por la tarde spa completo 3× (sauna finlandesa 10' · hielo 1' · jacuzzi 5') + sauna de hierbas 10' |
| 4 | Gacela — velocidad | calentamiento 5' · HIIT 30' en cinta/elíptica: 10× (1' al 80 % / 2' al 40 %) · core 10': plancha 3× al fallo · elevaciones de piernas colgado 3×15 · enfriamiento 5' |
| 5 | León — dominio total | circuito ×4 sin descanso: dominadas al fallo (máx 10) · flexiones al fallo (máx 25) · zancadas con mancuernas 10/pierna · remo con barra 10 pesado · 90'' al final de cada ronda |
| 6 | Recuperación activa | caminata rápida 30' sin música (mañana) + estiramientos y movilidad 30' de caderas y espalda (tarde) |
| 7 | Descanso total | nada intenso; caminar sin forzar |

### 10.4 · Dieta — cetogénica adaptativa, idéntica cada día

Ventana de alimentación **05:30–16:00**; de 16:00 a 05:30 sólo agua, café o té sin azúcar.

- **Comida 1 (05:30)**: 4 huevos revueltos con espinacas, medio aguacate, 2 lonchas de salmón ahumado, café negro con MCT o mantequilla. Alternativa: tortilla de 3 huevos con espinacas y ajo + medio aguacate.
- **Comida 2 (12:00)**: pechuga a la plancha 200 g o 2 muslos al horno + brócoli al vapor o salteado con AOVE y ajo + 20 g de macadamias.
- **Comida 3 (15:15)**: lomo de cerdo 150 g a la plancha o el resto del pollo + ensalada grande (puerro crudo, espinacas, aguacate, AOVE, limón, sal) + 20 g de almendras si falta energía.

Estos platos van en la `descripcion` de los tres hábitos de comida.

**Dos tareas semanales** (regla `semanal`, domingo, proyecto «Personal», categoría `general`; nacen en la siembra con `vence` = 2026-09-27):
1. **«Compra semanal cetogénica (80–100 €)»** — descripción = la lista entera: pollo entero 1,5 kg · salmón ahumado 200 g · 12 huevos L · chorizo ibérico 300 g · lomo embuchado 300 g · espinacas 500 g · brócoli 500 g · puerros · 5 aguacates · ajo · 4 limones · AOVE 750 ml · mantequilla 250 g · nata 35 % 1 L · macadamias 150 g · almendras 250 g · sal del Himalaya · café · agua con gas ×6.
2. **«Meal prep de la semana (2 h)»** — 16:00–18:00 (`hora_inicio`/`hora_fin`): todo el pollo cocinado, verduras cortadas, aguacates listos. «La comida no se decide cada día, se sirve».

### 10.5 · Hitos de los frentes (`hoy_hitos`)

| Frente | Hito | Fecha |
|---|---|---|
| Alberto Chan | Lanzamiento afiliados de trading | 2026-09-25 |
| Alfredo Valenzuela | Lanzamiento afiliados de trading (meeting 23-09) | 2026-09-25 |
| Elena / Amira Girls | Ads en vivo | 2026-09-29 |
| Zona Gemelos | Volver a llamar a la lista de leads | — |
| Jonathan | Revisión legal de la landing antes de tráfico | — |

Un hito con `hecho = true` desaparece de Hoy. `client_id` es opcional: Alfredo aún no existe en
`clients`, y un hito no debe esperar a que exista.

### 10.6 · Pantallas

| Pantalla | Qué cambia |
|---|---|
| **Hoy** | Arriba, fina: **«Día N / 90 · Zero Agent Challenge»** + adherencia de hoy `H/T` con barra + «racha de perfectos R». Después la tarjeta **AHORA** (decisión 7) con las tareas del bloque. Los 4 números. La lista de Hoy sin las ya pintadas en AHORA. **Hábitos por bloque**: una sección por bloque del día en orden de hora; el actual primero y desplegado, los pasados plegados con «3/4», los futuros plegados. `evitar` con estilo propio; `medir` con campo numérico inline (unidad; escribir = marcar); **Entreno** se despliega con la sesión de hoy y una nota corta. Al final, **Frentes**: los hitos con «en 3 días» / «hoy» / «pasado» / «sin fecha», rojo si ≤ 3 días. |
| **Calendario → Día** | Timeline **04:00–24:00** (`HORA_MIN = 4`). Los bloques del día como bandas de fondo (`bandasDeBloques`, color de fase al 12 %, nombre en pequeño); el actual más encendido; la línea de «ahora» encima. Las bandas no reciben toques (`pointer-events: none`) y van por debajo de las tarjetas: el arrastre de §5.1 no cambia nada — soltar dentro de un bloque sólo escribe la hora. El que cruza medianoche da **dos** bandas: 22:00→24:00 y, del día anterior, 04:00→04:30. Semana y Mes: sólo tareas. |
| **Hábitos** | Agrupados por `grupo` (los 5 del Protocolo en su orden, el resto después) y por hora; en cada fila hora, tipo, racha, cumplimiento. El formulario edita hora, grupo (los 5 + «Otro…» libre), tipo, unidad y objetivo (solo `medir`), bloque, descripción y el **editor del plan** (7 pestañas L–D, título + líneas; un día sin nada se borra del plan). Los `medir` enseñan una mini-línea de 4 semanas con el objetivo punteado (`LineaMedida`) en vez de la rejilla. |
| **Stats** | Arriba del todo, **Zero Agent Challenge** (`Estadisticas/Reto.jsx`): mapa de calor de los 90 días (`MapaCalor`: una columna por semana, lunes arriba; nivel 0–4 por adherencia; futuro **hueco**, que un día que no ha llegado no es un cero; hoy con borde; toque → «25 sep · 11/14»), los cuatro números (días perfectos · racha de perfectos · adherencia media · mejor semana) y una **línea por cada hábito `medir`** (peso, sueño) con el objetivo punteado (`LineaMedidaGrande`). El selector de hábito recalcula el mapa y la racha para ese hábito solo. Días pasados desde `hoy_dias` (los que trae el contexto, que van desde el inicio del reto, no desde el rango del selector); hoy, en vivo. El bloque **no** depende del selector 7·30·90: los 90 días del reto son los suyos, por eso va antes. Lo demás de la pantalla, intacto. Ojo: el 23-09-2026 es miércoles, así que la rejilla arranca con dos huecos y ocupa 14 columnas, no 13. |
| **Ajustes** | **Protocolo**: bloques por hora (nombre editable en línea, horas, fase, días como chips, activar/desactivar, ▲▼, borrar, añadir; «Restaurar el protocolo» = `hoy_sembrar_protocolo(true)`, que no toca ninguna marca). **Reto**: nombre, inicio, fin, descripción y el marcador «N / 90». **Frentes**: alta, edición y borrado de hitos. ⚠️ Un `input[type=time]` con reloj de 12 h necesita sitio para el AM/PM (recortado enseñaba «07:30» donde ponía 19:30) y un `[type=date]` dentro de `.rejilla-2` se sale de la tarjeta si no se le quita el `min-width` **al campo y al input**. |
| **Escritorio** | Decisión 9, todo en `src/estilos/escritorio.css` (una sola media query: el móvil no se puede romper desde ahí) + `usarEscritorio()`. **Raíl** a la izquierda (logo, «Nueva tarea» con su tecla, las 5 pestañas numeradas, Ajustes y la cuenta abajo); fuera la nav inferior, el FAB y el avatar de la cabecera. **Hoy = tres columnas**: el Día (el mismo `VistaDia`, con su propio scroll) \| reto + AHORA + números + lista \| hábitos por bloque + frentes. **Semana** con 7 columnas de ancho real; **kanban** lado a lado (sin scroll-snap, que en escritorio estorba); **Stats** y **Ajustes** en dos columnas (el Protocolo, `seccion--ancha`, ocupa las dos); **Hábitos** en rejilla de tarjetas. Las **hojas** pasan a **panel lateral derecho** de `--ancho-panel`, que se abre ENCIMA del contenido (apartarlo dejaba Hoy en 900 px y AHORA salía a una palabra por línea). Atajos: `1`–`5` pestañas · `t` Hoy · `n` nueva tarea · `Esc` cierra; no se disparan escribiendo en un campo. ⚠️ Varias reglas van con `.app--escritorio` delante a propósito: `.hoy`, `.habitos-hoy` y `.habitos-todos` ya son flex en columna y, según el orden en que Vite junte los CSS, una regla de la misma especificidad pierde (las tres columnas salían apiladas). |

### 10.7 · Capa de datos (amplía §7)

```
bloques.js      cargarBloques · crearBloque · actualizarBloque · borrarBloque · reordenarBloques · restaurarProtocolo (p_restaurar)
                FASES · nombreFase · colorBloque (token de la fase) · puros: tocaBloque(b, fecha) · bloquesDelDia(bloques, fecha) · contiene(b, fecha, hhmm)
                bloqueActual(bloques, fecha, hhmm) · siguienteBloque(bloques, fecha, hhmm) → { bloque, fecha }
                minutosRestantes(b, hhmm) · duracion(b) · textoMinutos(min) («1h 12m») · cruzaMedianoche(b)
retos.js        cargarRetos · cargarReto(fecha) · guardarReto(id|null, cambios) · retoVigente(retos, fecha)
                puros: totalDias(reto) · diaDelReto(reto, hoy) → { dia, total, antes, terminado, faltan } · fechasDelReto(reto)
hitos.js        cargarHitos · crearHito · actualizarHito · borrarHito
                puros: diasHasta(hito, hoy) · textoHito («en 3 días») · urgente (≤ 3 días y no hecho) · ordenarHitos
habitos.js      (+) hora · grupo · tipo · unidad · objetivo · bloqueId · plan · descripcion · TIPOS · GRUPOS
                marcar(habitoId, fecha, si, { nota, valor })   // un `medir` sin valor no es marca
                puros: estaHecho(h, marcas, fecha) · adherencia(habitos, marcas, fecha) → { tocaban, hechos, porcentaje }
                       diaPerfecto · rachaPerfectos(habitos, marcas, hoy, desde) · nivelAdherencia({tocaban, hechos}) → 0-4
                       planDeHoy(h, fecha) → { titulo, lineas } · agruparPorBloque(habitos, bloques, fecha) → [{ bloque, habitos }]
                       serieMedida(h, marcas, desde, hasta) → [{ fecha, valor }]
calendario.js   (+) HORA_MIN = 4 · bandasDeBloques(bloques, fecha) → [{ clave, bloque, top, alto, color }]
estadisticas.js (+) mapaCalorReto(habitos, marcas, reto, { dias, hoy, habito }) → celdas { fecha, tocaban, hechos, nivel, futuro, hoy }
                    resumenReto(mapa) → { diasPasados, perfectos, media, mejorSemana }
tareas.js       cargarDias devuelve también habitosTocaban · habitosHechos
catalogos.js    sembrar() llama también a hoy_sembrar_protocolo() (sin restaurar)
usarEscritorio()  matchMedia('(min-width: 1024px)') — lo único que decide el armazón (§10.0-9)
useDatos()      (+) bloques · retos · reto (el vigente hoy) · hitos · dias (hoy_dias del rango) · ahora ('HH:MM', reloj de 30 s)
                las marcas y los días se cargan desde el inicio del reto (o 91 días atrás, lo más antiguo)
```

### 10.8 · Verificación (amplía §8)

- `tests/forma.mjs`: tablas y columnas nuevas, sin GRANT a `anon`, RLS activa.
- `tests/protocolo.mjs` (puro): bloque actual a las 03:00 (Sueño), 04:31, 08:30, 23:59; sábado sin dailies; `diaDelReto` el 22-09 (antes), 23-09 (día 1), 21-12 (día 90), 22-12 (terminado); adherencia con `evitar` y `medir`; racha de perfectos.
- `tests/protocolo-siembra.mjs` (login real): 22 bloques, los hábitos de §10.2, el reto, 5 hitos, 2 tareas semanales; sembrar dos veces no duplica.
- `tests/captura.mjs`: fotos con Chrome headless y login real (`node tests/captura.mjs --ancho 390 --pagina [--pestana tareas] [--sub Activación] [--traza]`). Usa el Playwright de `~/CORE/aula-core` (2day no añade la dependencia). **Dos trampas medidas el 22-09:** la pantalla de login ya tiene texto y no dice «Cargando» (mirar sólo el texto daba la foto a medio cargar), y entre renders hay instantes sueltos sin «Cargando» — por eso se espera al armazón (`nav[aria-label="Principal"]`) y a **dos lecturas limpias seguidas**.
- Capturas a 390 px (móvil) y 1440×900 (escritorio).

## 11 · Fitness — sesiones por día y medidas (Alex, 02-10-2026)

> El 02-10 Alex fija el objetivo físico: pelear (boxeo y MMA) en 2027, 2028 y 2029 y llegar a su
> pico entonces. Antes de diseñar el plan quiere **medir el estado actual en tiempos y pesos**.
> Mandato literal: «una parte de fitness en 2day, por ahora muy simple, simplemente por días,
> empezando hoy viernes, con los ejercicios del día y la medición correspondiente para ir
> poniéndotela». Lo que Alex apunta aquí lo lee CORE de la base para construir el plan.

### 11.0 · Decisiones cerradas

| # | Decisión |
|---|---|
| 1 | **Sexta pestaña «Fitness»** en la nav, entre Hábitos y Stats. La nav pasa a 6 y los atajos de escritorio a `1`–`6` (corrige §5 y §10.0-9). |
| 2 | **Una sesión por fecha**, no por día de la semana (`hoy_fit_sesiones`): título, `lineas` (los ejercicios y el protocolo del día) y `pruebas` (lo que se mide ese día). El plan de §10.3 va por día ISO y no sirve para una semana concreta. |
| 3 | **Las sesiones las escribe CORE** (SQL, `sql/*-fitness-*.sql`); la app las enseña y recoge las medidas y una nota. No hay editor de sesiones en esta versión. |
| 4 | **Una medida = (fecha, clave, valor)** en `hoy_fit_marcas`. El valor va en la unidad de la prueba (kg, cm, m, rep, lpm); **los tiempos se guardan en segundos** y se escriben y se leen como `mm:ss`. Borrar el campo borra la medida. |
| 5 | La **clave** de una prueba es estable (`sentadilla_5rm`, `carrera_2400m`): es lo que permite comparar un re-test con el anterior. Cada prueba lleva su `ref` (texto: «normal · bueno · alto») para verla junto al campo. |
| 6 | **Si hay sesión de Fitness para hoy, el hábito Entreno enseña esa** en Hoy (título y líneas), no el plan semanal de §10.3. Sin sesión, todo sigue como estaba. |
| 7 | Las medidas **no entran en la adherencia** del reto: el hábito Entreno sigue siendo lo que cuenta. El peso sigue en el hábito «Peso» (un dato, un dueño). |

### 11.1 · Modelo (`sql/2026-10-02-fitness.sql`)

- **`hoy_fit_sesiones`**: `id`, `owner_id`, `fecha` (única por dueño), `titulo`, `lineas jsonb` (`[texto…]`), `pruebas jsonb` (`[{ clave, nombre, unidad, formato: 'numero'|'tiempo', ref, opcional }]`), `nota`.
- **`hoy_fit_marcas`**: `owner_id`, `fecha`, `clave`, `valor numeric`, `marcado_en`; clave primaria `(owner_id, fecha, clave)`.
- RLS `owner_id = auth.uid()` en los cuatro verbos y `revoke` a `anon`, como todas las `hoy_*`.

### 11.2 · Pantalla

**Fitness**: arriba la sesión de **hoy**, abierta: título, los ejercicios en lista y un campo por
prueba (nombre, campo, unidad y debajo la referencia), más una nota libre. Debajo, **Próximos días**
(en orden) y **Anteriores** (el más reciente primero), plegados, con su «3/5» de medidas puestas;
se abren y se rellenan igual (un día pasado se puede completar después). Escribir y salir del campo
guarda; es optimista y, si la base dice que no, vuelve atrás y avisa.

### 11.3 · Capa de datos (amplía §7)

```
fitness.js      cargarSesiones · cargarMedidas · medir(fecha, clave, valor|null) · anotarSesion(id, nota)
                puros: sesionDe(sesiones, fecha) · medidasDe(medidas, fecha) → { clave: valor }
                       progreso(sesion, medidas) → { hechas, total }
                       aSegundos('12:30') → 750 · deSegundos(750) → '12:30'
                       valorDeTexto(prueba, texto) → número | null | NaN · textoDeValor(prueba, valor)
useDatos()      (+) fitSesiones · fitMedidas · setFitMedidas · setFitSesiones
```

### 11.4 · Semana de medición (04-10 → 10-10-2026)

Cargada el 02-10 para V 02 → J 08 (`sql/2026-10-02-fitness-semana-medicion.sql`); Alex no
entrenó ni el viernes ni el sábado y empezó el domingo 04 con el test de combate, así que el
04-10 se movió (`sql/2026-10-04-fitness-semana-movida.sql`). El descanso pasa al final y el día
de medidas (sin gimnasio) hace de recuperación antes de la pierna. V 02 y S 03 quedan como
«Sin entreno», sólo con el pulso en reposo.

| Fecha | Sesión | Qué se mide |
|---|---|---|
| D 04-10 | Test de combate | golpes en 30'' ×3 · pulso al acabar los asaltos 1 y 5 y tras 1' de descanso |
| L 05-10 | Marcha con carga | 5 km con 15 kg (tiempo) |
| M 06-10 | Medidas del cuerpo | cintura · cuello (+ fotos) |
| X 07-10 | Potencia + pierna | salto vertical · salto horizontal · balón 4 kg por lado · sentadilla 5RM |
| J 08-10 | Test militar | flexiones en 2' · 2,4 km · pulso al acabar y al minuto · plancha |
| V 09-10 | Tirón + empuje | dominadas · peso muerto 5RM · press landmine 5RM por lado · press militar 5RM (opcional) · suspensión |
| S 10-10 | Descanso | — |

Todos los días, además, el pulso en reposo al despertar. **Sin press de banca**: a Alex le castiga
los hombros (condición genética); el empuje se mide con flexiones y press landmine.

### 11.5 · Verificación (amplía §8)

- `tests/forma.mjs`: las dos tablas responden con login y el anon no las lee.
- `tests/fitness.mjs`: puros (`aSegundos`, `deSegundos`, `valorDeTexto`, `progreso`) y, con login real, una medida de ida y vuelta en una fecha de 1970 (se escribe, se relee, se borra): no toca ninguna medida de Alex.

## 12 · Ficha de combate — el físico como el personaje de un juego (Alex, 04-10-2026)

> Mandato literal: «la parte de training mucho más completa… una ficha física de la persona
> completa, con stats… como si mi físico fuera mi avatar del juego… súper high tech, detalles
> HUD. Solo en training». Lo que se ve es la ficha que CORE monta analizando los entrenos (vídeos,
> medidas, sesiones) y se va versionando: la primera, v1 del 04-10, es el punto de partida y la
> última semana del reto se compara contra ella.

### 12.0 · Decisiones cerradas

| # | Decisión |
|---|---|
| 1 | Vive **dentro de Fitness**, arriba: un selector **Ficha · Sesiones** (Ficha por defecto). Nada sale de Fitness. |
| 2 | **Las fichas las escribe CORE** (SQL, `sql/*-ficha-*.sql`), igual que las sesiones: la app no tiene editor. Cada análisis nuevo es una **versión nueva** (fila nueva), nunca se pisa la anterior. |
| 3 | Se enseña la **última versión**; la **primera** se dibuja de fantasma en el radar y como «v1 → ahora» en cada atributo, para ver el cambio. |
| 4 | **Datos vivos**: el peso sale de la última marca del hábito «Peso» y el pulso en reposo de la última medida `pulso_reposo` de Fitness. Si existen, mandan sobre lo escrito en la ficha. |
| 5 | **Bloqueados**: las pruebas que faltan llevan su `clave` de Fitness; en cuanto hay una medida con esa clave, la casilla se «desbloquea» sola y enseña el valor. |
| 6 | Un atributo con `valor` null se pinta como **sin medir** (no cuenta en el radar). |
| 7 | Estética HUD sobre los tokens de siempre (fondo oscuro, acento naranja): esquinas de mira, rejilla tenue, cifras tabulares, monoespaciada para las etiquetas. Móvil primero; en escritorio, dos columnas. |

### 12.1 · Modelo (`sql/2026-10-04-ficha.sql`)

- **`hoy_fit_fichas`**: `id`, `owner_id`, `fecha`, `version` (texto, «v1»), `datos jsonb`, `created_at`; única `(owner_id, version)`. RLS y muro como todas las `hoy_*`.
- `datos`: `alias` · `clase` · `nivel` · `nivel_max` · `escala` · `cuerpo[{clave,nombre,valor,unidad,detalle,vivo?}]` · `atributos[{clave,nombre,valor|null,nota}]` · `motor[{nombre,valor,detalle}]` · `sparring{fuente,filas[{nombre,tu,rival}]}` · `fuertes[texto]` · `debiles[texto]` · `estilo{saco,sparring,hueco,referencias[]}` · `misiones[{texto,prioridad?}]` · `bloqueado[{clave,nombre,fecha,unidad,formato}]` · `alerta{titulo,texto}`. Cada dominio puede traer su propia `escala` (texto); si no, el pie de Atributos usa la general (la del boxeo).

### 12.2 · Capa de datos (amplía §11.3)

```
fitness.js      cargarFichas → [{ id, fecha, version, datos }] (por fecha)
                puros: fichaActual(fichas) · fichaInicial(fichas)
                       vivoDe(clave, { marcas, habitos, medidas }) → { valor, fecha } | null
useDatos()      (+) fitFichas
```

### 12.3 · Dominios (v1.1, Alex 04-10: «esto así de detallado tiene que ir en todos los ámbitos»)

La ficha no es sólo boxeo: es **todo lo que hace falta para el objetivo**. `datos.dominios[]`:
`{ clave, nombre, nivel|null, estado, resumen, atributos?, motor?, lecturas?[{nombre,valor,detalle,vivo?}], sparring?, fuertes?, debiles?, estilo?, misiones?, bloqueado? }`.
Los 10 de la v1 (MMA se quitó el 04-10: Alex sólo va a boxeo y nunca ha peleado): boxeo · fuerza · potencia · resistencia · capacidad militar · cuerpo ·
hombros y movilidad · recuperación · nutrición · mente y constancia. **Sólo lleva nivel lo
medido** (en la v1, boxeo); el resto va «en niebla» con lo que se sabe y sus pruebas por
desbloquear. El núcleo enseña el **mapa de dominios** (cada uno con nivel o estado y «x/y
pruebas»); al tocar uno, debajo sale su detalle. `vivo` admite `peso`, `habito:<nombre>`, `reto`
y cualquier clave de Fitness. `exploracion(dominio, medidas)` → `{ abiertas, total }`.


## 13 · Overview — la ficha IA de todo 2day (Alex, 22-10-2026)

Pedido: «una sección de overview que analice todo, generada con IA y que pueda recargar; una ficha como la
de fitness pero de todo: dónde se va el tiempo, mi perfil, los días seguidos que se ha movido algo… con
gráficas, que la pueda ver evolucionar».

- **Dónde:** Stats tiene dos caras, **Overview · Números** (se recuerda la última). Overview por defecto.
- **Dos capas.** Las **métricas** son puras (`src/datos/overview.js · calcularMetricas`) y se ven siempre,
  sin IA: días con movimiento (crear, completar o marcar), racha actual y mejor, hechas/creadas, vivas,
  atrasadas, mediana de días hasta cerrar, mapa de actividad, creadas vs hechas, horas planificadas por
  proyecto, vivas por proyecto y cuadrante, hora y día de la semana en que se completa, hábitos más flojos
  y frentes. Todo desde `stats_desde` (§5.3) o, sin él, los últimos 90 días.
- **La ficha** la escribe Claude (`api/overview.js`, función de Vercel, `claude-opus-5-5` con salida
  estructurada zod): titular, arquetipo, nota global 0-100, confianza, perfil (fortalezas y puntos ciegos),
  **8 dimensiones 0-10** para el radar (consistencia · ejecución · foco · planificación · carga · hábitos ·
  cuerpo · frentes), dónde se va el tiempo con fugas, patrones, riesgos, qué hacer y foco de la semana.
- **Versiones:** `hoy_overview` (RLS por dueño, `sql/2026-10-22-overview.sql`). «Regenerar» = INSERT,
  nunca se pisa. El radar lleva la versión anterior de fantasma (acero) y «Evolución» dibuja la nota global
  de todas. Se puede mirar cualquier versión vieja.
- **Seguridad:** la clave `ANTHROPIC_API_KEY` sólo vive en el servidor; la función exige una sesión válida
  de Supabase (`/auth/v1/user`) antes de llamar. La fila la guarda el navegador bajo su RLS.
- **En local:** `vite.config.js` sirve `/api/*` con la misma función (clave del entorno al arrancar Vite).

## 14 · Bitácora de Claude — las sesiones de Claude Code se apuntan solas (Alex, 23-10-2026)

Pedido: «abro cinco terminales de Claude Code y me pongo a programar; al acabar sé que hice muchas cosas
pero no qué. Que Claude Code apunte en 2day cada cosa que hace, y que después una IA lo divida en tareas,
las clasifique y marque hechas. Así automatizo y sigo teniendo el control de qué pasó».

### 14.0 · Decisiones cerradas (a solas, 23-10)

| # | Decisión |
|---|---|
| 1 | **Paso = un turno humano.** Lo que Alex pide (más lo que escribe a mitad de turno) y todo lo que Claude hace hasta el siguiente pedido: herramientas usadas, archivos tocados, comandos (su `description`), la respuesta final. Una herramienta suelta es ruido; un turno es la unidad que Alex reconoce. |
| 2 | **Lo apunta un hook de Claude Code, no Claude.** `Stop` y `SessionEnd` en `~/.claude/settings.json` llaman a `bitacora/bitacora.py hook`, que vuelve al instante y deja a un proceso suelto leer el transcript y subir los pasos. Nada depende de que el modelo se acuerde de registrar. |
| 3 | **El transcript es la fuente.** Se relee entero y se suben sólo los pasos nuevos o cambiados (estado local en `~/.claude/2day-bitacora/`). Idempotente: si falla la red, el siguiente `Stop` o el barrido lo arregla. |
| 4 | **Clasifica `claude -p` con la suscripción**, no la API (la clave de `~/.tokens` no tiene saldo): se lanza sin `ANTHROPIC_API_KEY`, sin herramientas, sin guardar sesión y con `HOY_BITACORA_OFF=1` para no apuntarse a sí mismo. Modelo `sonnet`, salida con `--json-schema`. |
| 5 | **Cuándo se procesa una sesión:** ~~a los 20 min quieta~~ → **al acabar cada turno** (`Stop`), desde el 23-10 (§14.4): el tablero tiene que moverse mientras se trabaja. Un LaunchAgent (`net.core.2day-bitacora`, cada 5 min) barre los transcripts de las últimas 6 h y procesa lo que se haya quedado atrás. El candado es **por sesión**: cuatro terminales se clasifican a la vez. |
| 6 | **Las tareas que salen son tareas normales de 2day** (`hoy_tareas` + `hoy_capa` con `hoy_para` = el día lógico del paso), así cuentan en Hoy, Stats y Overview. ~~Hecha → `done`~~ → desde el 23-10 **la IA nunca completa** (§14.4): terminada por Claude → `review`; a medias → `in_progress`. **Completar es de Alex.** La IA **reusa una tarea abierta** de Alex si el trabajo es esa tarea (la marca hecha si acabó) en vez de duplicarla, y **reusa las tareas ya sacadas de la misma sesión** en las tandas siguientes. |
| 7 | ~~Pendientes a Bandeja~~ → **Próximos pasos** que Alex valida (§14.6). Antes: **Pendientes que quedan** (lo que Alex dijo «luego» o lo que quedó por hacer explícitamente): como mucho 3 por tanda, a Bandeja, sin paso. |
| 8 | **Dónde se ve:** Tareas → pestaña **Claude**: día con flechas, totales (sesiones · pasos · tareas hechas · horas), y cada sesión con título, carpeta, horario, resumen, las tareas que salieron y los pasos en crudo. Proyecto por carpeta sólo como pista para la IA. |

### 14.4 · El tablero de Claude (Alex, 23-10-2026)

Pedido: «quiero un kanban: cuando en alguna terminal empecemos algo, la tarea en curso; cuando lo termine, en
revisión; y cuando yo la dé por completada, completado».

- **Tres columnas sobre el vocabulario de siempre** (`estado` + `etapa_id` de su tablero, como el kanban de
  Tareas): **En curso** (`in_progress`) · **En revisión** (`review`) · **Completado** (`done`, del día elegido).
  Entran las tareas con algún paso de Claude enlazado, también una tarea vieja de Alex que la IA reconoce.
- **En curso al instante.** `UserPromptSubmit` apunta en la sesión `activo_desde` + `activo_pedido`; la
  columna En curso enseña arriba una tarjeta **«Trabajando ahora»** por terminal activa (sesión y lo que se
  pidió) hasta que el turno acaba y la IA lo pone en su tarea. `Stop` lo borra y procesa. Una marca de más de
  3 h se da por muerta (terminal cerrada a lo bruto).
- **Revisión la pone Claude, Completado sólo Alex.** En revisión cada tarjeta lleva **Completar** (✓, la misma
  puerta `completar()` de la app) y **Devolver** (a En curso). Si Alex vuelve a pedir algo sobre una tarea en
  revisión, la IA la devuelve a En curso sola. Una tarea que Alex ya completó no se reabre: el trabajo nuevo
  es otra tarea.
- **Lo de antes del 23-10** (las 37 que la IA marcó hechas al estrenar la bitácora) se queda como historia.
- En el móvil las columnas van apiladas con **En revisión primero** (es la que pide una decisión); en escritorio, en fila.
- La pestaña Claude tiene dos caras, **Tablero · Sesiones** (la de §14.0-8). El tablero se refresca cada
  15 s mientras está a la vista.

### 14.5 · Clasificación completa y las dos caras a la par (Alex, 23-10-2026)

Pedido: «que las clasifique por proyectos y todo lo demás automáticamente» y «asegúrate de que el kanban y la
sesión van a la par».

- **Siempre proyecto, categoría y cuadrante.** Categorías = las de Alex (`hoy_categorias`, también las suyas
  como `ceo` o `paid_media`), no sólo las 7 del portal. Proyecto: de la **chuleta** `bitacora/proyectos.md`
  (alias → proyecto, la edita Alex) o de `hoy_proyectos`; si no encaja ninguno, la IA propone `proyecto_nuevo`
  y se **crea** (o se reusa si ya existe con ese nombre). En una tarea existente sólo se rellena lo que falta:
  lo que Alex clasificó a mano no se toca.
- `bitacora.py reclasificar` rellena lo que les falte a las tareas que ya salieron.
- **A la par:** las dos caras leen el estado de la misma lista en memoria y se refrescan cada 15 s; si la
  base dice otra cosa (una tarea nueva, o el Mac la pasó a revisión), se relee. Sesiones enseña cada tarea con
  el nombre de su columna, «Trabajando ahora» y **Completar** en las que están en revisión.

### 14.6 · Próximos pasos y Claude con manos en 2day (Alex, 23-10-2026)

Pedido: «un próximos pasos que se cree después de cada sesión; lo dejas ahí, validamos cada uno y se
distribuye en tareas y días» y «si desde Claude hay que crear frentes, mover tareas, crear categorías o
proyectos, o lo que sea, que lo muevas, para que la app esté siempre actualizada».

**Próximos pasos (`hoy_proximos`)**
- Los escribe el clasificador en cada tanda de una sesión: como mucho **5 por sesión**, cada uno con título,
  descripción, proyecto, categoría, cuadrante, **día propuesto** y minutos. Sustituyen a los «pendientes» de
  §14.0-7 (ya no entra nada a Bandeja sin que Alex lo valide).
- **Se mantienen vivos:** en cada tanda la IA ve los próximos de la sesión (propuestos, aceptados y
  descartados) y devuelve la lista nueva de propuestos: actualiza, añade o quita. Nunca vuelve a proponer lo
  aceptado o descartado.
- **El día lo reparte la IA** mirando la CARGA de los 10 días siguientes (tareas planificadas por día) y el
  cuadrante: lo urgente pronto, sin pasar de ~5 tareas en un día.
- **Validar** (Tareas → Claude → **Próximos**): cada paso con su día editable, **Aceptar** (crea la tarea con
  `hoy_para` = ese día, proyecto, categoría y cuadrante; el paso queda `aceptado` con su `tarea_id`) o
  **Descartar**. «Aceptar todos» por sesión.
- Claude puede proponer uno a mano en mitad de una sesión con `2day proximo …`.

**El comando `2day`** (`bitacora/dosday.py`, enlazado en `~/.local/bin/2day`) — las manos de Claude:
`ver · crear · mover · editar · completar · archivar · proyecto · proyectos · categoria · categorias ·
frente · frentes · proximo`. Escribe con `SUPABASE_DB_URL` del vault como dueño Alex. Una tarea se nombra por
el principio de su id o por un trozo único del título. Sólo tareas personales (`hoy_tareas`); las del portal
siguen por el portal.
- **Instrucción global** en `~/.claude/CLAUDE.md`: en cualquier sesión, cuando se decide, empieza, bloquea o
  termina trabajo, Claude lo refleja con `2day` sin que se lo pidan. **`completar` sólo si Alex lo dice**
  (§14.4: Completado es de Alex); lo terminado por Claude va a `review`.

### 14.7 · Reuniones de Wispr Flow (Alex, 23-10-2026)

Pedido: «conecto Wispr Flow para que después de cada meeting se me pongan las tareas en 2day: entro en la
reunión, salgo y tengo el resumen y las tareas puestas».

- **Fuente: la base local de Wispr Flow** (`~/Library/Application Support/Wispr Flow/flow.sqlite`, tabla
  `Meetings`: título, inicio, fin, duración, resumen de Wispr) y la transcripción de cada una
  (`meetings/<id>/refined.ndjson`, si no `live.ndjson`). Sólo lectura, abierta en modo `ro`.
- **Cuándo:** el LaunchAgent de la bitácora (cada 5 min) mira las reuniones **terminadas** (`finalized`, con
  `endedAt`) que aún no están en 2day. Se procesa cuando hay transcripción o resumen listos.
- **Qué deja** (`hoy_reuniones`): título en español, resumen corto (3-6 puntos), decisiones, proyecto y la
  transcripción. Las **tareas de Alex** que salen van a **Próximos** (`hoy_proximos.reunion_id`) con día
  propuesto según la carga, para validarlas como las de las sesiones (Aceptar todos = un toque). Las de otros
  no: van en el resumen.
- **Lo viejo:** al estrenar se registran las reuniones desde el 19-10 (cuando Alex empezó a grabarlas todas),
  pero sólo las de las últimas 48 h generan próximos.
- **Dónde se ve:** Tareas → Claude → **Reuniones** (lista con resumen y decisiones) y sus próximos en
  Próximos, agrupados por reunión.

### 14.8 · El widget de la barra de menús (Alex, 23-10-2026)

Pedido: «un widget en el Mac cuando tengo terminales activas, visibilidad completa de cada cosa, que se abra y
se oculte, sencillo y vivo; que 2day esté siempre actualizado aunque no entre en la app».

- **SwiftBar** (app de la barra de menús) con el plugin `bitacora/widget/2day.10s.py`, que se refresca cada
  10 s leyendo la base. En la barra: `● N` terminales trabajando · `◐ N` en revisión · `✦ N` próximos (o
  «2day» si no hay nada).
- **Al desplegar:** Trabajando ahora (cada terminal con lo que se pidió y desde cuándo; **clic = salta a esa
  ventana de Terminal**, por el `tty` que apunta el hook) · Clasificando · En revisión (Completar · Devolver) ·
  Próximos (Aceptar · Descartar), agrupados por sesión o reunión · Reuniones de hoy · Hoy (hechas / en Hoy) ·
  Abrir 2day · Empezar.
- Las acciones van por el comando `2day` (`aceptar`, `descartar`, `completar`, `mover`): una sola puerta.
- `hoy_cc_sesiones.tty` lo escribe el hook `UserPromptSubmit`.

### 14.9 · Clientes de GrowthInfo en las tareas personales y el panel visual (Alex, 23-10-2026)

Pedido: «archiva bien las tasks: hay algunas que dicen Elena y no están en el proyecto de Elena» y «¿podemos
hacerlo más visual?».

- **Una tarea personal puede llevar cliente** (`hoy_tareas.client_id`, también en `hoy_proximos` y
  `hoy_reuniones`): es una **etiqueta**, la tarea NO va al portal (el equipo no la ve). La vista `hoy_todas`
  devuelve ese `client_id` y la app la pinta en el proyecto del cliente, junto a las del portal
  (`sql/2026-10-23-cliente-en-personales.sql`). Esto relaja §1/§4 sólo para la etiqueta: mover y completar
  siguen siendo de `hoy_tareas`.
- Clientes válidos: los vivos de `clients` con `scope = 'growthinfo'` (Elena Calleja, Jonathan, Zona Gemelos,
  A. Valenzuela, Alberto Chan, Academia Chatting). La IA los ve como «cliente:<id>» en PROYECTOS y la chuleta
  dice qué alias van a cada uno; «GrowthInfo» queda para lo general (Pere, ScaleInfo, portal, equipo).
- En la hoja de una tarea personal el selector de Proyecto ofrece también los clientes («Nombre · cliente»).
  `2day … --proyecto Elena` también entiende clientes.
- `bitacora.py rearchivar` pasa lo que estaba en «GrowthInfo» (o sin proyecto y salido de Claude) a su
  cliente; guarda antes un respaldo JSON en `~/.claude/2day-bitacora/` para deshacer.
- **Panel visual** (`#panel`, `src/pantallas/Panel/`): ventana estrecha (420 px) pegada a la derecha que abre
  y cierra `bitacora/panel.sh` (entrada «▣ Panel visual» del widget). Va en un **Chrome aislado** (perfil propio en `~/.claude/2day-bitacora/panel-chrome`): así abrir/cerrar es arrancar/parar ese proceso, sin adivinar ventanas del Chrome de Alex (sin permiso de accesibilidad no se pueden leer). La primera vez se entra con la cuenta. Anillo del día (hechas / total de hoy),
  tres cifras (trabajando · revisión · próximos), terminales con pulso, revisión con ✓/↩, próximos con ✓/✕,
  en curso y reuniones de 24 h. Refresco cada 10 s.

### 14.1 · Modelo (`sql/2026-10-23-bitacora.sql`)

- **`hoy_cc_sesiones`** — `id` = session_id de Claude Code · `cwd`, `carpeta`, `titulo` (el `ai-title` del transcript), `resumen` (lo escribe la IA), `inicio`, `ultimo`, `pasos`, `terminada`, `procesar_pedido` (lo enciende la app), `procesada_en`.
- **`hoy_cc_sesiones.activo_desde` · `activo_pedido`** (§14.4, `sql/2026-10-23-bitacora-tablero.sql`): la terminal está trabajando ahora mismo.
- **`hoy_reuniones`** (§14.7, `sql/2026-10-23-reuniones.sql`) — `id` = id de Wispr · `titulo`, `titulo_wispr`, `inicio`, `fin`, `minutos`, `participantes` · `resumen`, `decisiones` jsonb, `proyecto_id` · `resumen_wispr`, `transcripcion` · `procesada_en`. `hoy_proximos.reunion_id` enlaza sus tareas.
- **`hoy_proximos`** (§14.6, `sql/2026-10-23-proximos.sql`) — `sesion_id` · `titulo`, `descripcion`, `proyecto_id`, `categoria`, `cuadrante`, `dia`, `minutos`, `orden` · `estado` (`propuesto`/`aceptado`/`descartado`) · `tarea_id` · `origen` (`ia`/`claude`) · `decidido_en`.
- **`hoy_cc_pasos`** — `id` = uuid del mensaje humano · `sesion_id` · `inicio`, `fin` · `pedido`, `respuesta` (recortadas) · `herramientas` jsonb (`{Bash: 4, Edit: 2}`) · `archivos[]` · `comandos[]` · `tarea_id` (la `hoy_tareas` a la que la IA lo asignó; null = ruido) · `procesado`.
- RLS por dueño en las dos; `anon` revocado. El hook y el clasificador escriben con `SUPABASE_DB_URL` del vault (sólo en el Mac) poniendo `owner_id` de Alex a mano.

### 14.2 · Capa de datos (amplía §7)

```
bitacora.js   cargarDia(fecha, horaReinicio) → [Sesion con pasos y tareas]   · pedirProceso(sesionId)
              cargarTablero(fecha, horaReinicio) → { activas, enCurso, revision, completadas }   (§14.4)
tareas.js     aEstado(tarea, clave)   // mueve a la etapa con esa clave de SU tablero (como completar)
              puro: resumenDia(sesiones, tareas) → { sesiones, pasos, hechas, abiertas, minutos }
```

### 14.3 · Verificación

- `python3 bitacora/bitacora.py barrer --horas 48` sube las sesiones de ayer y hoy; `procesar --ya` las clasifica; se comprueba en la base que hay tareas con pasos enlazados.
- La pestaña Claude pinta el día con capturas a 390 y 1440.
