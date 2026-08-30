# Chess Coach

Pega el PGN de una partida y te dice qué jugaste mal, qué era mejor, en qué fase
pierdes más y qué errores repites de una partida a otra.

El análisis lo hace **Stockfish** en el servidor. No hay adivinanzas: cada
comentario sale de una evaluación concreta del motor.

## Qué hace

**Repaso guiado (lo que ves al analizar)**
- La partida se recorre como una única línea temporal: cada pulsación adelanta
  **una jugada**, con animación, y la última jugada queda resaltada. Nunca salta
  varias jugadas de golpe, para no perder el hilo de cómo se llegó a la posición.
- Todo gira en torno a **tus** jugadas: el tablero se orienta desde tu lado, cada
  parada dice si la jugada es tuya o del rival, y se comenta cualquier jugada
  tuya en la que hubiera algo mejor de verdad (no solo las peores de la partida).
  Cuando el rival falla se te avisa sin dar la solución, para que la busques.
- También se reconoce lo que haces bien, pero solo con mérito comprobable: haber
  encontrado la jugada del motor justo después de un fallo del rival.
- El color es una elección explícita en el formulario, con los nombres reales
  sacados de las cabeceras del PGN: sin elegirlo no se puede analizar. Se recuerda
  el nombre para preseleccionarlo la próxima vez.
- El botón ⇅ cambia de bando durante el repaso y, además de girar el tablero,
  corrige el color de la partida ya guardada (`PATCH /api/partidas/:id/color`),
  para que el historial y las estadísticas no cuenten los errores del rival como
  propios.
- Los consejos no viven aparte: están colgados de la parada exacta en la que la
  partida los demuestra, y la barra de progreso marca dónde están.
- Antes de una jugada clave se dibujan las dos opciones a la vez: en rojo lo que
  jugaste, en verde lo que recomendaba el motor, con la oscilación de la
  evaluación. Al pulsar, la jugada se reproduce.
- Cada hábito (rey sin enrocar, dama temprana, piezas dormidas, peones del rey)
  se ilustra sobre la posición que lo demuestra, con las casillas marcadas.
- Una pantalla por idea, sin scroll vertical: el tablero se dimensiona según el
  hueco que deja el texto. Se avanza también deslizando el dedo o con el teclado.
- Hay un atajo para saltar al siguiente aviso, y el informe completo jugada a
  jugada sigue disponible al final.
- En cada aviso hay un botón **¿Por qué?** que pide a Claude el razonamiento de
  esa jugada concreta (ver más abajo). Solo aparece si el servidor tiene clave.

**Por partida**
- Evalúa las N+1 posiciones de la partida y calcula, para cada jugada, la pérdida
  en centipeones y la caída de probabilidad de victoria.
- Clasifica cada jugada: mejor / excelente / buena / imprecisión / error / error grave.
- Da la mejor jugada del motor y su continuación, con flechas en el tablero
  (roja lo que jugaste, verde lo que había que jugar).
- Identifica la apertura contra las 3.810 entradas del libro ECO de lichess, y
  dice en qué jugada te saliste de teoría.
- Detecta patrones concretos y explica la razón, sin necesidad de IA: pieza
  colgada, **defensa abandonada** (moviste la única pieza que defendía otra, y el
  rival se lleva lo que quedó suelto), captura ganadora que no viste, mate
  perdido, mate permitido.
- Detecta hábitos de partida completa: no enrocar, sacar la dama pronto,
  desarrollo lento, mover la misma pieza varias veces, debilitar los peones del rey.
- Precisión global por jugador, con el método de Lichess (media ponderada por
  volatilidad + media armónica).

**Importar de Chess.com**
- Escribes tu usuario y trae tus últimas partidas (hasta 50, buscando en los
  últimos seis meses de archivos). No hace falta login: su API pública sólo pide
  el nombre.
- Cada partida tiene su propio botón: **Analizar** la analiza y abre su repaso al
  momento, y las que ya lo están ofrecen **Ver**. Tu color se deduce de las
  cabeceras, así que no hay que elegirlo.
- Aparte, y en segundo plano, se pueden analizar todas las pendientes de golpe.
  Eso no sirve para leer diez informes seguidos, sino para dar volumen a la
  detección de patrones: con dos partidas Progreso no puede decir nada. Por eso
  al terminar lleva a esa pestaña, que es donde se ve el resultado.
- La lista sobrevive a entrar y salir del repaso, para no tener que buscar otra vez.
- Tu historial queda ligado a ese usuario (`cc-<usuario>`), de modo que te sigue
  del móvil al ordenador sin contraseñas. **Sin autenticación**: cualquiera que
  escriba tu usuario ve tu historial. Son análisis de partidas ya públicas en
  Chess.com; si eso deja de bastar, `usuarioDe()` en `routes/api.ts` es el único
  punto que hay que cambiar.

**Por historial**
- Guarda cada partida analizada y agrega tus errores más repetidos, en cuántas
  partidas aparece cada uno, tu rendimiento por apertura y tu evolución.
- Convierte todo eso en un plan de entrenamiento priorizado.

## Arranque rápido

Necesitas Node 20+ y Stockfish.

```bash
# Debian/Ubuntu
sudo apt-get install stockfish
# macOS
brew install stockfish

npm install
npm run dev      # API en :8080, web en :5173
```

Abre http://localhost:5173.

Otros comandos:

```bash
npm test         # 33 pruebas: puntuación, etiquetas, aperturas, API y persistencia
npm run typecheck
npm run build    # compila la web dentro de server/dist/public
npm start        # sirve API + web en :8080
```

## Configuración

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `8080` | Puerto HTTP. |
| `DATA_DIR` | `./.data` | Dónde vive la base SQLite. En Railway, el volumen. |
| `STOCKFISH_PATH` | autodetectado | Ruta al binario. Se buscan `/usr/games`, `/usr/local/bin`, `/usr/bin` y Homebrew. |
| `ENGINE_POOL_SIZE` | nº de CPUs (máx. 4) | Procesos de Stockfish en paralelo. |
| `ENGINE_THREADS` | `1` | Hilos por proceso. |
| `ENGINE_HASH_MB` | `64` | Tabla de transposición por proceso. |
| `MAX_PLIES` | `300` | Tope de medias jugadas por partida. |
| `CHESSCOM_USER_AGENT` | uno propio | Chess.com rechaza peticiones sin User-Agent identificable. |
| `ANTHROPIC_API_KEY` | — | Opcional. Activa el comentario narrado por IA. |
| `COACH_MODEL` | `claude-sonnet-5` | Modelo para esa narrativa. |

Sin `ANTHROPIC_API_KEY` la aplicación funciona igual: las explicaciones
deterministas se generan a partir de los datos del motor, y las funciones que
necesitan el modelo ni siquiera aparecen en la interfaz.

### El botón "¿Por qué?"

Stockfish dice **qué** pasa (esta jugada cuesta 390 centipeones, la mejor era
Be3) pero no **por qué**. Eso es razonamiento, y es lo que hace el modelo.

Se pide bajo demanda, por jugada, no durante el análisis: cada explicación es una
llamada de pago y sólo interesan las jugadas que llaman la atención. La respuesta
se guarda dentro del informe, así que volver a esa pantalla no vuelve a cobrar.

Al modelo se le pasan **sólo hechos verificables** —FEN, evaluación antes y
después, mejor jugada, línea principal del motor, piezas que quedan sin defensa,
material, fase— y tiene prohibido inventar variantes o contradecir al motor. El
análisis duro sigue siendo de Stockfish; el modelo únicamente lo traduce a un
motivo.

Usa `claude-opus-5` con pensamiento adaptativo, que es justo el caso que lo
justifica: entender por qué una jugada falla es un problema de razonamiento, no
de redacción. Se puede cambiar con `COACH_MODEL`.

Para activarlo en Railway, añade `ANTHROPIC_API_KEY` en las variables del
servicio. Sin ella el endpoint responde 503 y el botón no se muestra.

## Cómo funciona el análisis

Se evalúa **cada posición de la partida una sola vez**. La pérdida de una jugada
es la diferencia entre la evaluación de la posición previa y la de la posición
resultante, ambas llevadas al punto de vista de quien movió. Equivale a comparar
contra la mejor jugada del motor sin evaluar cada alternativa por separado, y
baja el coste de O(jugadas × alternativas) a O(jugadas).

Tres decisiones que importan y no son obvias:

1. **Si juegas la jugada del motor, la pérdida es cero por definición.** Las dos
   posiciones se evalúan en búsquedas independientes a la misma profundidad, y el
   efecto horizonte puede hacer que la evaluación caiga aunque la jugada sea la
   mejor. Es lo típico en sacrificios, donde la compensación aparece varios plies
   después. Sin esta regla, una combinación correcta se penalizaría como un error.

2. **Se clasifica por caída de probabilidad de victoria, no por centipeones.**
   Perder 200 cp cuando ibas +900 es irrelevante; perder 200 cp en una posición
   igualada decide la partida.

3. **`score mate 0` significa que el bando que mueve ya está mateado.** Como el
   cero no tiene signo, multiplicarlo por la perspectiva da `-0` y la posición se
   leería como mate a favor del bando equivocado: la jugada de mate puntuaría 0%.

Profundidades: rápida 14, normal 17, profunda 20. Una partida de 40 jugadas tarda
unos 3 s en normal con 4 procesos.

## Arquitectura

```
chess-coach/
├── server/
│   ├── src/engine/        uci.ts (protocolo UCI) + pool.ts (procesos en paralelo)
│   ├── src/analysis/      scoring, clasificación, etiquetas, fases, aperturas, explicaciones
│   ├── src/db/            SQLite: partidas + tablas derivadas de etiquetas y fases
│   ├── src/coach/         narrativa opcional por IA
│   ├── src/routes/        API HTTP
│   └── src/types.ts       tipos del dominio, compartidos con la web
└── web/                   React + Vite, importa los tipos vía el alias @shared
```

Las tablas `etiquetas` y `fases` guardan los agregados al insertar cada partida,
así que las estadísticas globales no releen ningún informe: su coste no crece
con el tamaño de las partidas.

No hay login. Cada navegador genera un identificador que viaja en la cabecera
`x-coach-user`; es lo que separa los históricos. Sustituirlo por usuarios de
verdad solo toca `usuarioDe()` en `server/src/routes/api.ts`.

## API

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/api/salud` | Estado del motor y de la aplicación. |
| `POST` | `/api/analizar` | Analiza un PGN. Cuerpo: `pgn`, `nivel`, `colorJugador`, `nombreJugador`, `guardar`, `narrar`. |
| `GET` | `/api/chesscom/:usuario` | Últimas partidas de Chess.com sin analizar, marcando las ya importadas. |
| `GET` | `/api/partidas` | Historial del usuario. |
| `GET` | `/api/partidas/:id` | Informe completo de una partida. |
| `POST` | `/api/partidas/:id/por-que` | Razonamiento del modelo sobre una jugada (`ply`), cacheado en el informe. |
| `PATCH` | `/api/partidas/:id/color` | Corrige el bando de una partida guardada, sin volver a analizarla. |
| `DELETE` | `/api/partidas/:id` | Borra una partida. |
| `GET` | `/api/estadisticas` | Agregados y plan de entrenamiento. |

## Despliegue en Railway

El servicio usa el `Dockerfile` de esta carpeta, con la **raíz del servicio en
`chess-coach`**. El Dockerfile instala Stockfish y verifica en tiempo de build que
responde al protocolo UCI, para que un problema con el motor rompa el build con un
mensaje claro en vez de dejar un contenedor reiniciándose.

Monta un volumen en `/data` para conservar el historial entre despliegues. Sin
volumen la aplicación arranca igual, pero la base se borra en cada deploy.

## Regenerar el libro de aperturas

`server/src/data/eco.json` se compila desde los TSV de
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) que
hay en `server/data-src/`:

```bash
npm -w server run build:eco
```

## Limitaciones conocidas

- La profundidad rápida (14) puede etiquetar como error algún sacrificio correcto
  cuya compensación aparece más tarde. Para partidas con táctica densa, usa normal
  o profunda.
- `pieza_colgada` mira si la mejor respuesta del rival es una captura de pieza
  menor o mayor. Un cambio malo bien calculado puede caer en esa etiqueta.
- El historial va por navegador, no por persona: si cambias de dispositivo,
  empiezas de cero.
- El "¿Por qué?" razona sobre los datos del motor, no sobre literatura de
  ajedrez: acierta con las razones tácticas y con los conceptos habituales, pero
  no cita teoría de aperturas ni planes de un libro concreto. Ahí es donde
  encajaría un RAG sobre documentos de ajedrez más adelante.
