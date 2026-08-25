# GoOnMap — Visualización de marcadores en el mapa

> Fuente de verdad para colores, badges y estilos de los puntos del mapa.
> Código en: `src/components/MapComponent.tsx` · `src/components/ActivityList.tsx`

---

## 1. Color del marcador (relleno SVG) — por Likes

Función: `getLikeColor(likes)` en `MapComponent.tsx`

| Color | Hex | Likes | Significado |
|---|---|---|---|
| 🔵 Azul | `#3b82f6` | 0 | Sin datos de likes |
| 🟡 Amarillo | `#eab308` | 1 – 3 | Poco interés |
| 🟠 Naranja | `#f97316` | 4 – 6 | Interés moderado |
| 🟢 Verde | `#22c55e` | 7 + | Muy popular |

> El color del stroke (borde del SVG) es `#fff` sin badge, o el color del badge si lo tiene.

---

## 2. Badge de tiempo — por proximidad temporal al inicio

Función: `getTimeBadge(activity)` en `ActivityList.tsx`
Prioridad: **tiempo tiene precedencia sobre distancia** (`timeBadge ?? distBadge`)

### Efecto visual en el marcador cuando hay badge
Al activarse cualquier badge, el marcador muestra **dos señales visuales simultáneas**:
1. **Borde coloreado** — el contorno del pin SVG cambia de blanco a `borderColor` del badge (stroke-width 2.5 en lugar de 1.5), creando un halo/marco de color visible alrededor del punto.
2. **Pastilla (pill) en la esquina** — pequeña etiqueta posicionada en `top:-6px; right:-6px` con fondo del color del badge, texto blanco, emoji + label. Esto es la "raya encima" que aparece sobre el punto.

| Badge | Emoji | Color real — Hex | Condición |
|---|---|---|---|
| `Ahora` | ⚡ | 🟡 `#f59e0b` | Evento empezó hace ≤25 min y aún no terminó |
| `30min` | ⏰ | 🔴 `#ef4444` | Empieza en 26 – 45 min |
| `1h` | 🕐 | 🟠 `#f97316` | Empieza en 46 – 105 min |
| `2h` | 🕑 | 🔵 `#3b82f6` | Empieza en 106 – 135 min |
| `1día` | 📅 | 🟣 `#8b5cf6` | Es mañana (o hoy sin hora exacta) |

> El badge `Ahora` activa además animación CSS `markerPulse` (latido 1.2s infinito) en todo el pin.
> Fuera de estas ventanas → sin badge de tiempo.

---

## 3. Badge de distancia — solo si no hay badge de tiempo

Función: `getDistanceBadge(activity, userCoords)` en `ActivityList.tsx`
Mismo efecto visual que los badges de tiempo: borde coloreado en el pin + pastilla encima con el label.

| Badge | Color real — Hex | Condición (metros reales) |
|---|---|---|
| `Aquí` | 🔴 `#ef4444` | ≤ 150 m |
| `200m` | 🟠 `#f97316` | 151 – 400 m |
| `500m` | 🟡 `#eab308` | 401 – 750 m |
| `1km` | 🟢 `#84cc16` | 751 – 1500 m |
| `2km` | 🟢 `#22c55e` | 1501 – 2500 m |
| _(sin badge)_ | — | > 2500 m |

> `userCoords` usa GPS en tiempo real si está activo; si no, el centro de búsqueda manual.

---

## 4. Marcadores de itinerario (Ruta)

- Los marcadores en la ruta **no tienen badge** (se suprime con `inItinerary ? undefined : markerBadge`).
- Se superpone un marcador numerado encima: círculo púrpura `linear-gradient(135deg,#667eea,#764ba2)`, número blanco, 20×20 px.

### Colores de líneas de ruta

| Modo | Color real — Hex | Estilo |
|---|---|---|
| 🚶 A pie | 🟢 `#10b981` verde | Línea discontinua `6 4` |
| 🚲 Bici | 🟡 `#f59e0b` naranja | Línea discontinua `10 4` |
| 🚇 Metro | 🔴 `#ef4444` rojo | Línea continua |

---

## 5. Marcador del usuario (posición)

| Tipo | Visual |
|---|---|
| Centro de búsqueda manual | Punto azul `#1a73e8`, 14×14 px, sin animación |
| GPS en tiempo real (`En vivo`) | Punto azul `#1a73e8` + 3 ondas de ripple (verde→teal→azul), 60×60 px |

> Ripple layers: `rgba(16,185,129,0.60)` · `rgba(14,150,200,0.42)` · `rgba(26,115,232,0.26)`, delay 0 / 0.65s / 1.3s.

---

## 6. Círculo de radio de búsqueda

- Color: `#667eea` (violeta-azul)
- `fillOpacity: 0.07`, `weight: 1.5`

---

## Resumen visual rápido

```
Marcador sin badge:
  ┌─────────────┐
  │  pin SVG    │  ← relleno = getLikeColor(likes)
  │  stroke     │  ← blanco #fff, grosor 1.5
  └─────────────┘

Marcador CON badge (tiempo o distancia):
  ┌─────────────┐ [⚡Ahora]  ← pastilla coloreada, arriba a la derecha
  │  pin SVG    │  ← relleno = getLikeColor(likes)
  │  stroke     │  ← color del badge, grosor 2.5 (halo/marco visible)
  └─────────────┘
  El borde coloreado + la pastilla son las dos señales visuales del badge.

Marcador en ruta (itinerario):
  [1]              ← número en círculo púrpura encima
  ┌─────────────┐
  │  pin SVG    │  ← sin badge, solo color por likes
  └─────────────┘
```
