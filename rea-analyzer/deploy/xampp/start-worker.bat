@echo off
REM REA Web Analyzer - Node worker inditasa (Windows / XAMPP).
REM Ezt a folyamatot futtatni kell, amig az elemzo mukodik.
REM Tartos futtatashoz: Feladatutemezo "Rendszerinditaskor", vagy pm2/NSSM szolgaltatas.

cd /d "%~dp0\..\.."
echo REA Web Analyzer worker indul...
echo Konyvtar: %CD%
node worker\worker.mjs
pause
