@echo off
set /p msg="Digite a mensagem do commit: "
if "%msg%"=="" set msg="Commit automatico em %date% %time%"

echo.
echo Adicionando arquivos...
git add .

echo.
echo Fazendo commit...
git commit -m "%msg%"

echo.
echo Enviando para o GitHub...
git push

echo.
echo Concluido!
pause