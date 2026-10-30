# Backend de Análisis Comercial (.NET 8). Contexto de build: AnalisisComercial/Backend. Dos imágenes, un Dockerfile:
#   docker build --platform linux/amd64 -f Despliegue/backend.Dockerfile --target api  -t analisis-prod-api:<fecha>  Backend
#   docker build --platform linux/amd64 -f Despliegue/backend.Dockerfile --target sync -t analisis-prod-sync:<fecha> Backend
# Corren como usuario sin privilegios (app, de la imagen de Microsoft). La API escucha en 8080; la sincronización no
# escucha nada (sale a Chess y escribe en la base). appsettings.Development.json, bin/, obj/ y las pruebas no entran
# (backend.Dockerfile.dockerignore).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/AnalisisComercial.Domain/*.csproj         src/AnalisisComercial.Domain/
COPY src/AnalisisComercial.Application/*.csproj    src/AnalisisComercial.Application/
COPY src/AnalisisComercial.Infrastructure/*.csproj src/AnalisisComercial.Infrastructure/
COPY src/AnalisisComercial.API/*.csproj            src/AnalisisComercial.API/
COPY src/AnalisisComercial.Sync/*.csproj           src/AnalisisComercial.Sync/
RUN dotnet restore src/AnalisisComercial.API/AnalisisComercial.API.csproj \
 && dotnet restore src/AnalisisComercial.Sync/AnalisisComercial.Sync.csproj
COPY src/ src/
RUN dotnet publish src/AnalisisComercial.API/AnalisisComercial.API.csproj -c Release -o /out/api --no-restore /p:UseAppHost=false \
 && dotnet publish src/AnalisisComercial.Sync/AnalisisComercial.Sync.csproj -c Release -o /out/sync --no-restore /p:UseAppHost=false \
 && rm -f /out/api/appsettings.Development.json /out/sync/appsettings.Development.json

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_ENVIRONMENT=Production \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    TZ=America/Argentina/Tucuman
USER $APP_UID

FROM base AS sync
COPY --from=build /out/sync .
ENTRYPOINT ["dotnet", "AnalisisComercial.Sync.dll"]

# La API va última: un build sin --target arma la API.
FROM base AS api
COPY --from=build /out/api .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "AnalisisComercial.API.dll"]
