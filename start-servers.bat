@echo off
setlocal

echo ========================================
echo Iniciando servidores (Frontend + Backend B)
echo ========================================
echo.

REM Backend B (porta 3002)
echo Abrindo backend-b na porta 3002...
start "Backend B - Porta 3002" cmd /k "cd /d %~dp0backend-b && npm run dev"

REM Aguarda alguns segundos antes do frontend
timeout /t 2 /nobreak >nul

REM Frontend (porta 3000)
echo Abrindo frontend na porta 3000...
start "Frontend - Porta 3000" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Servidores iniciados:
echo - Backend B: http://localhost:3002
echo - Frontend: http://localhost:3000
echo.
echo Pode fechar esta janela quando quiser.
echo.
pause
