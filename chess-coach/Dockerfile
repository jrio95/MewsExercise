# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 se compila desde fuente; este toolchain no llega a la imagen final.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

# Fuera las dependencias de desarrollo: la web ya esta compilada dentro de
# server/dist/public y su toolchain no aporta nada en runtime.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STOCKFISH_PATH=/usr/games/stockfish

# gosu nos permite bajar de root a un usuario sin privilegios en el entrypoint,
# despues de ajustar el propietario del volumen.
# Anadimos contrib por si la distribucion mueve stockfish de componente; si ya
# esta en main, la linea es inocua.
RUN echo 'deb http://deb.debian.org/debian bookworm contrib' > /etc/apt/sources.list.d/contrib.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends stockfish gosu \
 && rm -rf /var/lib/apt/lists/* \
 # Comprobamos motor y gosu aqui: es mejor romper el build con un mensaje claro
 # que desplegar un contenedor que se reinicia en bucle.
 && echo 'uci' | /usr/games/stockfish | grep -q '^uciok$' \
 && gosu node true \
 && echo "stockfish y gosu verificados"

# npm workspaces eleva todas las dependencias a la raiz, asi que no existe
# server/node_modules: package-lock.json fija ese reparto de forma determinista.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/package.json ./package.json

# Railway monta aqui el volumen persistente. Sin volumen la app funciona igual,
# pero el historico se pierde en cada despliegue.
RUN mkdir -p /data && chown -R node:node /data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# El contenedor arranca como root y el entrypoint baja a `node` con gosu, una vez
# ajustado el propietario del volumen montado.
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
