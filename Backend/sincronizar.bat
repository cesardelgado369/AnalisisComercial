@echo off
rem Baja los datos reales de Chess a la base de Analisis Comercial y muestra el resumen por mes.
rem   sincronizar.bat              corrida normal (la primera vez pide la clave de Chess)
rem   sincronizar.bat clave        vuelve a pedir usuario y clave
rem   sincronizar.bat recalcular   ademas recalcula las compras de todos los meses (si cambio la regla de "compro")
chcp 65001 >nul
title Sincronizar Chess - Analisis Comercial (Madomi)
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
  echo No se encontro .NET. Instalalo desde https://dotnet.microsoft.com/download
  pause
  exit /b 1
)

set "OPCION="
if /i "%~1"=="clave" set "OPCION=-CambiarClave"
if /i "%~1"=="recalcular" set "OPCION=-RecalcularCompras"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sincronizar.ps1" %OPCION%
echo.
pause
