-- ═══════════════════════════════════════════════════════════════════════════════
-- 2day — Ficha de combate (LOGICA §12): tabla + v1 de Alex, el punto de partida
-- 04-10-2026 · decide Alex · la escribe CORE tras analizar la sesión 1 y los sparrings
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Una fila por VERSIÓN de la ficha (nunca se pisa una anterior). La app enseña la última y
-- dibuja la primera de fantasma. IDEMPOTENTE: la v1 se reescribe si ya existe.

begin;

create table if not exists public.hoy_fit_fichas (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  fecha      date not null,
  version    text not null,
  datos      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, version)
);

alter table public.hoy_fit_fichas enable row level security;
drop policy if exists p_hoy_fit_fichas_owner on public.hoy_fit_fichas;
create policy p_hoy_fit_fichas_owner on public.hoy_fit_fichas for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.hoy_fit_fichas from anon;
grant select, insert, update, delete on public.hoy_fit_fichas to authenticated;

with yo as (select id from auth.users where email = 'alex@growthinfo.io')
insert into public.hoy_fit_fichas (owner_id, fecha, version, datos)
select yo.id, '2026-10-04', 'v1', $j${
  "alias": "ALEX",
  "clase": "Presionador de volumen y ritmo · híbrido",
  "nivel": 4.5,
  "nivel_max": 10,
  "nivel_nombre": "Nivel de boxeo",
  "escala": "3 principiante de gimnasio · 5 amateur con peleas · 7 nacional · 8 pro",
  "objetivo": "Pelear boxeo y MMA en 2027 · 2028 · 2029",
  "dominios": [
    {
      "clave": "boxeo",
      "nombre": "Boxeo",
      "nivel": 4.5,
      "estado": "medido",
      "resumen": "Presionador de volumen y ritmo, híbrido. Te pegan muy poco y tienes buenas combinaciones cuando atacas; te falta atacar más y contestar cuando te atacan.",
      "atributos": [
        {
          "clave": "ritmo",
          "nombre": "Ritmo / flow",
          "valor": 6,
          "nota": "coge la cadencia y encadena; mejor cuanto más suelto"
        },
        {
          "clave": "motor",
          "nombre": "Volumen / motor",
          "valor": 5.5,
          "nota": "340-420 golpes en 1' · baja 10-15 % al 3.er asalto"
        },
        {
          "clave": "combos",
          "nombre": "Variedad / combos",
          "valor": 5.5,
          "nota": "≈10 golpes en 2,2 s cabeza-cuerpo cuando ataca"
        },
        {
          "clave": "defensa",
          "nombre": "Guardia / defensa",
          "valor": 4.5,
          "nota": "0 golpes limpios a la cabeza en 4K · pero los guantes tapan los ojos"
        },
        {
          "clave": "pies",
          "nombre": "Pies",
          "valor": 4,
          "nota": "postura larga, piernas rectas, zancada al entrar"
        },
        {
          "clave": "mecanica",
          "nombre": "Mecánica",
          "valor": 4,
          "nota": "golpe de brazo, poca cadera"
        },
        {
          "clave": "cabeza",
          "nombre": "Cabeza",
          "valor": 4,
          "nota": "1 esquiva clara en 4K; se agacha por la cintura"
        },
        {
          "clave": "combate",
          "nombre": "Combate real",
          "valor": 4,
          "nota": "contra 1 de cada 6 · el rival inicia el doble"
        },
        {
          "clave": "potencia",
          "nombre": "Potencia",
          "valor": null,
          "nota": "sin medir · «nunca paso del 80 %»"
        }
      ],
      "motor": [
        {
          "nombre": "Golpes en 1' · saco pesado",
          "valor": "340-420",
          "detalle": "asalto 1 · el 3.º 290-360"
        },
        {
          "nombre": "Golpes por minuto en flow",
          "valor": "~100 → ~80",
          "detalle": "fresco → cansado"
        },
        {
          "nombre": "Elíptica 32'",
          "valor": "10,7 km",
          "detalle": "250 kcal · ~1,8 W/kg · zona 2"
        },
        {
          "nombre": "Sesión 1",
          "valor": "~55'",
          "detalle": ">1.300 golpes · 600-700 kcal"
        },
        {
          "nombre": "Con fatiga",
          "valor": "cae la guardia",
          "detalle": "el volumen se mantiene"
        }
      ],
      "sparring": {
        "fuente": "Sparring jul-2025 · vídeo de 50'' en 4K a 20 fps",
        "filas": [
          {
            "nombre": "Golpes por minuto",
            "tu": "35-45",
            "rival": "30-45"
          },
          {
            "nombre": "Limpios a la cabeza",
            "tu": "—",
            "rival": "0 en ti"
          },
          {
            "nombre": "Combinación más larga",
            "tu": "≈10",
            "rival": "≈5"
          },
          {
            "nombre": "Contra en <1 s",
            "tu": "1 de 6",
            "rival": "—"
          },
          {
            "nombre": "Intercambios iniciados",
            "tu": "≈6",
            "rival": "≈12"
          },
          {
            "nombre": "Esquivas claras",
            "tu": "1",
            "rival": "—"
          }
        ]
      },
      "fuertes": [
        "Volumen alto y sostenido",
        "Golpea en movimiento",
        "Combinaciones largas cabeza-cuerpo cuando ataca",
        "Muy difícil de golpear limpio a la cabeza",
        "Aguanta de cerca sin descomponerse",
        "Esquiva y contra cuando sale (21,6 s)",
        "Relajado: no gasta en tensión"
      ],
      "debiles": [
        "La mano baja tras golpear → le entra la contra",
        "5 de cada 6 veces se cubre y no devuelve",
        "Los guantes le tapan los ojos",
        "Se agacha doblando la cintura, ojos al suelo",
        "Ataca con zancada, peso encima del pie delantero",
        "Se cuadra y las piernas van rectas (hábito de MMA)",
        "Cede la iniciativa: el rival inicia el doble",
        "Siempre al mismo ritmo · poca pegada"
      ],
      "estilo": {
        "saco": "Presiona con volumen y ritmo",
        "sparring": "Alto, cubierto y reactivo; buenas combinaciones cuando decide atacar",
        "hueco": "Que el estilo del saco aparezca cuando le devuelven los golpes",
        "referencias": [
          "Tyson / Patterson · peek-a-boo",
          "Golovkin · presión sin zancadas",
          "Lomachenko · salir en ángulo"
        ]
      },
      "misiones": [
        {
          "texto": "Cubrirse y devolver en menos de 1 s",
          "prioridad": true
        },
        {
          "texto": "Ojos por encima de los guantes",
          "prioridad": true
        },
        {
          "texto": "Agacharse con las rodillas · cuerda al hombro",
          "prioridad": true
        },
        {
          "texto": "Combinaciones de 3+ · prohibido el jab suelto",
          "prioridad": true
        },
        {
          "texto": "Golpea y sal: toda combinación acaba fuera de la línea"
        },
        {
          "texto": "Pivotes sobre el pie delantero"
        },
        {
          "texto": "Línea en el suelo: pies a la anchura de los hombros"
        },
        {
          "texto": "Tres velocidades: 10'' lento · 5'' a tope"
        },
        {
          "texto": "Asaltos solo al cuerpo"
        },
        {
          "texto": "Potencia 6 × (15'' a tope + 45'' flow)"
        },
        {
          "texto": "Uppercut cuando el rival se agacha"
        },
        {
          "texto": "Sparring grabado en 4K, trípode, de lado"
        }
      ],
      "bloqueado": []
    },
    {
      "clave": "mma",
      "nombre": "MMA y lucha",
      "nivel": null,
      "estado": "sin datos",
      "resumen": "Has peleado MMA, pero no hay vídeo ni prueba de lucha. Lo único visto: la postura ancha y cuadrada (sirve contra el derribo, estorba en boxeo).",
      "atributos": [
        {
          "clave": "derribo_def",
          "nombre": "Defensa de derribo",
          "valor": null,
          "nota": ""
        },
        {
          "clave": "derribos",
          "nombre": "Derribos",
          "valor": null,
          "nota": ""
        },
        {
          "clave": "suelo",
          "nombre": "Control en el suelo",
          "valor": null,
          "nota": ""
        },
        {
          "clave": "sumisiones",
          "nombre": "Sumisiones",
          "valor": null,
          "nota": ""
        },
        {
          "clave": "piernas",
          "nombre": "Patadas y rodillas",
          "valor": null,
          "nota": ""
        },
        {
          "clave": "transiciones",
          "nombre": "Transiciones pie-suelo",
          "valor": null,
          "nota": ""
        }
      ],
      "debiles": [
        "Se agacha por la cintura con la cabeza baja: en MMA es rodillazo o guillotina",
        "En el clinch se queda pasivo (sparring de boxeo)"
      ],
      "misiones": [
        {
          "texto": "Grabar un sparring de MMA o de lucha (4K, trípode, de lado)",
          "prioridad": true
        },
        {
          "texto": "Contar tu historial de MMA: peleas, resultado, en qué ganabas"
        }
      ],
      "bloqueado": [
        {
          "clave": "mma_sparring",
          "nombre": "Sparring de MMA grabado",
          "fecha": "2026-10-11",
          "unidad": "vídeo",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "fuerza",
      "nombre": "Fuerza",
      "nivel": null,
      "estado": "se mide esta semana",
      "resumen": "Sin press de banca (hombros). El empuje se mide con flexiones y press landmine. El plan viejo tenía un solo día de fuerza: se propone dos.",
      "lecturas": [
        {
          "nombre": "Sentadilla 5RM · referencia",
          "valor": "100 kg",
          "detalle": "normal 65-80 · bueno 100 · alto 125"
        },
        {
          "nombre": "Peso muerto 5RM · referencia",
          "valor": "130 kg",
          "detalle": "normal 80-100 · bueno 130 · alto 165"
        },
        {
          "nombre": "Dominadas · referencia",
          "valor": "12-15",
          "detalle": "normal 5-8 · alto 20+"
        },
        {
          "nombre": "Flexiones en 2' · referencia",
          "valor": "55-60",
          "detalle": "normal 30-40 · alto 75+"
        }
      ],
      "bloqueado": [
        {
          "clave": "sentadilla_5rm",
          "nombre": "Sentadilla 5RM",
          "fecha": "2026-10-07",
          "unidad": "kg",
          "formato": "numero"
        },
        {
          "clave": "peso_muerto_5rm",
          "nombre": "Peso muerto 5RM",
          "fecha": "2026-10-09",
          "unidad": "kg",
          "formato": "numero"
        },
        {
          "clave": "press_landmine_5rm_dcha",
          "nombre": "Landmine 5RM · dcha",
          "fecha": "2026-10-09",
          "unidad": "kg",
          "formato": "numero"
        },
        {
          "clave": "press_landmine_5rm_izda",
          "nombre": "Landmine 5RM · izda",
          "fecha": "2026-10-09",
          "unidad": "kg",
          "formato": "numero"
        },
        {
          "clave": "dominadas",
          "nombre": "Dominadas",
          "fecha": "2026-10-09",
          "unidad": "rep",
          "formato": "numero"
        },
        {
          "clave": "flexiones_2min",
          "nombre": "Flexiones en 2'",
          "fecha": "2026-10-08",
          "unidad": "rep",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "potencia",
      "nombre": "Potencia",
      "nivel": null,
      "estado": "se mide esta semana",
      "resumen": "La pegada nunca pasa del 80 % porque te cansas: es lo que más falta para que tu volumen haga daño.",
      "debiles": [
        "Potencia de golpe sin medir · «nunca paso del 80 %»"
      ],
      "misiones": [
        {
          "texto": "Potencia 6 × (15'' a tope + 45'' flow)",
          "prioridad": true
        }
      ],
      "lecturas": [
        {
          "nombre": "Salto vertical · referencia",
          "valor": "55 cm",
          "detalle": "normal 40-45 · alto 65+"
        },
        {
          "nombre": "Salto horizontal · referencia",
          "valor": "250 cm",
          "detalle": "normal 210-230 · alto 275+"
        }
      ],
      "bloqueado": [
        {
          "clave": "salto_vertical",
          "nombre": "Salto vertical",
          "fecha": "2026-10-07",
          "unidad": "cm",
          "formato": "numero"
        },
        {
          "clave": "salto_horizontal",
          "nombre": "Salto horizontal",
          "fecha": "2026-10-07",
          "unidad": "cm",
          "formato": "numero"
        },
        {
          "clave": "balon_4kg_dcha",
          "nombre": "Balón 4 kg · dcha",
          "fecha": "2026-10-07",
          "unidad": "m",
          "formato": "numero"
        },
        {
          "clave": "balon_4kg_izda",
          "nombre": "Balón 4 kg · izda",
          "fecha": "2026-10-07",
          "unidad": "m",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "resistencia",
      "nombre": "Resistencia",
      "nivel": null,
      "estado": "parcial",
      "resumen": "Pulso en reposo bueno y base aeróbica razonable. Tu nota: «recuperación rápida pero desgaste muy rápido». Falta la carrera y el pulso en los asaltos.",
      "lecturas": [
        {
          "nombre": "Pulso en reposo",
          "valor": "54 lpm",
          "detalle": "bueno 52-58",
          "vivo": "pulso_reposo"
        },
        {
          "nombre": "Elíptica 32'",
          "valor": "10,7 km",
          "detalle": "250 kcal · ~1,8 W/kg · zona 2"
        },
        {
          "nombre": "Saco 1.º → 3.er asalto",
          "valor": "−10-15 %",
          "detalle": "340-420 → 290-360 golpes"
        },
        {
          "nombre": "2,4 km · referencia",
          "valor": "10:30",
          "detalle": "normal 12-13' · alto <9:30"
        }
      ],
      "misiones": [
        {
          "texto": "Banda de pecho (tipo Polar H10) para tener el pulso de cada asalto"
        }
      ],
      "bloqueado": [
        {
          "clave": "carrera_2400m",
          "nombre": "2,4 km",
          "fecha": "2026-10-08",
          "unidad": "min:s",
          "formato": "tiempo"
        },
        {
          "clave": "pulso_carrera_min",
          "nombre": "Pulso al minuto de correr",
          "fecha": "2026-10-08",
          "unidad": "lpm",
          "formato": "numero"
        },
        {
          "clave": "pulso_asalto_1",
          "nombre": "Pulso en un asalto",
          "fecha": "2026-10-11",
          "unidad": "lpm",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "militar",
      "nombre": "Capacidad militar",
      "nivel": null,
      "estado": "se mide esta semana",
      "resumen": "Carga, aguante y fondo: marchar con peso, empujar, aguantar en tensión.",
      "lecturas": [
        {
          "nombre": "Marcha 5 km · 15 kg · referencia",
          "valor": "45'",
          "detalle": "normal 50-55' · alto <40'"
        },
        {
          "nombre": "Plancha · referencia",
          "valor": "3:00",
          "detalle": "normal 1:30-2:00 · alto 3:40+"
        },
        {
          "nombre": "Suspensión · referencia",
          "valor": "1:30",
          "detalle": "normal 0:45-1:00 · alto 2:00+"
        }
      ],
      "bloqueado": [
        {
          "clave": "marcha_5km_15kg",
          "nombre": "Marcha 5 km · 15 kg",
          "fecha": "2026-10-05",
          "unidad": "min:s",
          "formato": "tiempo"
        },
        {
          "clave": "plancha",
          "nombre": "Plancha",
          "fecha": "2026-10-08",
          "unidad": "min:s",
          "formato": "tiempo"
        },
        {
          "clave": "suspension",
          "nombre": "Suspensión",
          "fecha": "2026-10-09",
          "unidad": "min:s",
          "formato": "tiempo"
        }
      ]
    },
    {
      "clave": "cuerpo",
      "nombre": "Cuerpo",
      "nivel": null,
      "estado": "parcial",
      "resumen": "De 63-64 kg a 80, siempre fino. Objetivo: seguir ganando peso sin subir grasa.",
      "lecturas": [
        {
          "nombre": "Peso",
          "valor": "80 kg",
          "detalle": "03-10",
          "vivo": "peso"
        },
        {
          "nombre": "Altura",
          "valor": "184 cm"
        },
        {
          "nombre": "IMC",
          "valor": "23,6"
        },
        {
          "nombre": "Grasa estimada",
          "valor": "12-15 %",
          "detalle": "se ven los abdominales de arriba"
        },
        {
          "nombre": "Edad",
          "valor": "25"
        }
      ],
      "bloqueado": [
        {
          "clave": "cintura",
          "nombre": "Cintura",
          "fecha": "2026-10-06",
          "unidad": "cm",
          "formato": "numero"
        },
        {
          "clave": "cuello",
          "nombre": "Cuello",
          "fecha": "2026-10-06",
          "unidad": "cm",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "movilidad",
      "nombre": "Movilidad y articulaciones",
      "nivel": null,
      "estado": "sin datos",
      "resumen": "Sin lesiones. Los hombros tienen una condición genética (sin especificar) que veta el press de banca. En la sesión 1, dolor de cansancio en los dos hombros, no de lesión.",
      "misiones": [
        {
          "texto": "Contar qué condición tienes en el hombro",
          "prioridad": true
        },
        {
          "texto": "Movilidad de cadera, espalda y hombros: 30' después de la marcha"
        }
      ],
      "bloqueado": [
        {
          "clave": "movilidad_test",
          "nombre": "Test de movilidad",
          "fecha": "2026-10-12",
          "unidad": "",
          "formato": "numero"
        }
      ]
    },
    {
      "clave": "recuperacion",
      "nombre": "Recuperación",
      "nivel": null,
      "estado": "parcial",
      "resumen": "Objetivo de sueño 6,5 h: corto para este volumen. El plan viejo ponía hielo justo después de la fuerza, que frena la adaptación.",
      "lecturas": [
        {
          "nombre": "Horas de sueño",
          "valor": "—",
          "detalle": "objetivo 6,5 h",
          "vivo": "habito:Horas de sueño"
        },
        {
          "nombre": "Pulso en reposo",
          "valor": "54 lpm",
          "detalle": "si sube 5+ al despertar, día flojo",
          "vivo": "pulso_reposo"
        }
      ],
      "misiones": [
        {
          "texto": "Apuntar las horas de sueño cada día en 2day"
        }
      ]
    },
    {
      "clave": "nutricion",
      "nombre": "Nutrición",
      "nivel": null,
      "estado": "alerta",
      "resumen": "≈1.900-2.000 kcal con keto y ayuno desde las 16:00, y una sesión como la del 04-10 gasta 600-700. Estás en déficit: choca con ganar peso sin grasa, y el «nunca paso del 80 %» puede ser en parte falta de hidratos.",
      "lecturas": [
        {
          "nombre": "Lo que comes",
          "valor": "~1.950 kcal",
          "detalle": "keto + ayuno desde las 16:00"
        },
        {
          "nombre": "Gasto sesión 1",
          "valor": "600-700 kcal",
          "detalle": "encima del reposo"
        },
        {
          "nombre": "Objetivo días de entreno",
          "valor": "~3.000 kcal",
          "detalle": "se cuadra el S 10-10"
        }
      ]
    },
    {
      "clave": "mente",
      "nombre": "Mente y constancia",
      "nivel": null,
      "estado": "parcial",
      "resumen": "Zero Agent Challenge en marcha. Objetivo a largo plazo: pelear en 2027, 2028 y 2029 y llegar al pico entonces.",
      "lecturas": [
        {
          "nombre": "Día del reto",
          "valor": "—",
          "vivo": "reto"
        },
        {
          "nombre": "Objetivo",
          "valor": "2027-29",
          "detalle": "boxeo y MMA"
        }
      ]
    }
  ],
  "alerta": {
    "titulo": "Combustible",
    "texto": "Comes ≈1.900-2.000 kcal (keto + ayuno) y gastas >600 en una sesión así: déficit. Para ganar peso sin grasa, ≈3.000 kcal los días de entreno."
  }
}$j$::jsonb
from yo
on conflict (owner_id, version) do update set fecha = excluded.fecha, datos = excluded.datos;

commit;

-- ── COMPROBACIÓN ─────────────────────────────────────────────────────────────
--   select version, fecha, datos->>'nivel' from hoy_fit_fichas order by fecha;
