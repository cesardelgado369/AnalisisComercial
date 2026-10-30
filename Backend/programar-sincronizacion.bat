@echo off
rem Deja la sincronizacion con Chess de esta PC andando sola: todos los dias a las 06:30 y con un clic en el escritorio.
rem   programar-sincronizacion.bat          crea (o actualiza) la tarea diaria y el acceso directo
rem   programar-sincronizacion.bat 07:15    lo mismo, a otra hora
rem   programar-sincronizacion.bat quitar   borra la tarea y el acceso directo
chcp 65001 >nul
title Programar la sincronizacion con Chess - Analisis Comercial (Madomi)
cd /d "%~dp0"

set "OPCION="
if not "%~1"=="" set "OPCION=-Hora %~1"
if /i "%~1"=="quitar" set "OPCION=-Quitar"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0programar-sincronizacion.ps1" %OPCION%
echo.
pause
