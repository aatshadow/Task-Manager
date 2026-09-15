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
| `hoy_capa` | La capa personal de **cualquier** tarea: `tarea_id` (id de `hoy_tareas` o de `tasks`, sin FK), `origen` (`hoy`/`portal`), cuadrante (`q1..q4`), `hoy_para` (date), orden, hora_inicio, hora_fin, seguida, notas. |
| `hoy_dias` | Cierre del día: fecha, planificadas, hechas, nota. Lo único que no se puede derivar después. |
| `hoy_habitos` · `hoy_marcas` | Hábito: nombre, icono, color, cadencia (`diario`/`dias`/`semana`), `dias` (1=L…7=D), `veces_semana`, `archivado_at`. Marca: una por (hábito, fecha). |
| `hoy_plantillas` · `hoy_plantilla_items` | Ítem: titulo, descripcion, categoria, cuadrante, grupo (fase), `dias_offset`, posicion. |

**La vista `hoy_todas`** (`security_invoker`) es lo único que lee la app para listar: une
`hoy_tareas` + las filas de `tasks` que me tocan (decisión 3), ambas con la misma forma, con la
capa ya pegada. Columnas: `id, origen, titulo, descripcion, proyecto_id, client_id, categoria,
pipeline_id, etapa_id, estado, inicio, vence, responsable_id, participantes, hecha, hecha_en,
archivado_at, created_at, updated_at, posicion, cuadrante, hoy_para, orden, hora_inicio, hora_fin,
seguida, notas, prioridad_portal, fase`. La app escribe en `hoy_tareas` o en `tasks` según `origen`.

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
| Cuadrante · Hoy · orden · horas · notas · seguir | `hoy_capa` | `hoy_capa` |
| Mover de etapa / completar | `etapa_id` + `estado` + `hecha` (dos ejes) | `stage_id` + `status` + `completed` (dos ejes, `cambiosAlMover`) |
| Responsable | `responsable_id` (informativo: no ven 2day) | `assignee_id` (real: lo ven en su portal) |
| Archivar | `archivado_at` | `archived_at` |
| Borrar | sí | no (es de dirección desde el portal; aquí se archiva) |

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
| **Calendario** | Día (timeline por horas como el «Ongoing» del mockup; las sin hora arriba como «todo el día»; línea naranja de «ahora») · Semana (7 columnas) · Mes (rejilla con puntos; toque → lista del día). Cabecera con mes y flechas como el mockup. Solo tareas (por `vence`, y por `inicio→vence` si hay período). Arrastrar/asignar fecha desde la hoja. |
| **Hábitos** | Los de hoy con marca grande; rejilla de las últimas 4 semanas por hábito; racha; cumplimiento de la semana. Alta/edición con cadencia. |
| **Stats** | Selector 7 · 30 · 90 días. **Gráfico lineal temporal: creadas vs hechas por día.** Hechas por proyecto, por categoría, por cuadrante (barras). Sobrecarga: planificadas vs hechas por día (de `hoy_dias`). Racha de días con ≥1 hecha. Hábitos: cumplimiento por semana. |
| **Ajustes** | Proyectos · Categorías · Pipelines y etapas · Cuadrantes (etiqueta y color) · Plantillas (crear/editar/instanciar) · Día (hora de reinicio, nevera, bandeja) · Cuenta (salir). |
| **Acceso** | Email + contraseña (Supabase Auth). Sesión persistida. |

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
                planificarHoy(tarea, fecha|null) · seguir(tarea, si) · archivar(tarea, si) · borrar(tarea)
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
