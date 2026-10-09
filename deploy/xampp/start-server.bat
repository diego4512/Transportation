@echo off
REM BP Utas Node szerver indítása (a projekt gyökeréből). Az Apache ide továbbít: http://127.0.0.1:8787
cd /d "%~dp0\..\.."
if not exist data\gtfs.sqlite (
  echo Menetrend betoltese elso inditaskor...
  call npm run gtfs:import
)
call npm start
