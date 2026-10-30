# Front de Análisis Comercial. Contexto de build: AnalisisComercial/Frontend
#   docker build --platform linux/amd64 -f Despliegue/web.Dockerfile --build-context despliegue=Despliegue -t analisis-prod-web:<fecha> Frontend
# Etapa 1 compila con Vite; etapa 2 lo sirve Nginx sin privilegios (puerto 8080) con nginx-web.conf, que además manda
# /api/ a la API. /plataforma/ (el login central) lo resuelve el Nginx del host. Igual que el CashFlow.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Relativos: mismo origen, sin CORS. La cookie de sesión de la app queda en este dominio.
ARG VITE_API_URL=/api
ARG VITE_PLATAFORMA_URL=/plataforma/api
ENV VITE_API_URL=$VITE_API_URL VITE_PLATAFORMA_URL=$VITE_PLATAFORMA_URL
RUN npm run build && find dist -name '*.map' -delete

# stable: la rama estable vigente. Construir con --pull para no usar una base vieja.
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=despliegue nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
