@echo off
REM Menetrend frissítése – érdemes a Feladatütemezőben naponta hajnalban futtatni, utána a szervert újraindítani.
cd /d "%~dp0\..\.."
call npm run gtfs:import
