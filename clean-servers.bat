@echo off
echo ========================================
echo Limpando processos e cache dos servidores
echo ========================================
echo.

REM Mata todos os processos Node.js
echo [1/3] Encerrando processos Node.js...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo Processos Node.js encerrados.
) else (
    echo Nenhum processo Node.js encontrado.
)

REM Aguarda para garantir que os processos terminem
timeout /t 3 /nobreak >nul

REM Limpa processos nas portas específicas
echo [2/3] Limpando portas 3002 e 8008...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8008"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul

REM Remove pasta .next
echo [3/3] Removendo cache do Next.js...
if exist ".next" (
    rd /s /q ".next" 2>nul
    timeout /t 2 /nobreak >nul
    if exist ".next" (
        echo ERRO: Nao foi possivel remover a pasta .next completamente.
        echo Tente fechar o Visual Studio Code ou outros editores e execute novamente.
    ) else (
        echo Cache do Next.js removido com sucesso!
    )
) else (
    echo Pasta .next nao encontrada.
)

echo.
echo ========================================
echo Limpeza concluida!
echo ========================================
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
