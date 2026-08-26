@echo off
REM ===========================================================================
REM  Backup diario da ILNET - chamado pelo Agendador de Tarefas do Windows.
REM
REM  Copia o banco (do Supabase) e as fotos (do servidor) para a pasta
REM  configurada em backup.config.json.
REM
REM  Guarda o que aconteceu em backup.log, ao lado deste arquivo. Se um dia o
REM  backup parar de rodar, a resposta esta nesse arquivo.
REM ===========================================================================

REM Entra na pasta do projeto (a pasta acima desta), venha de onde vier a chamada.
cd /d "%~dp0.."

echo. >> scripts\backup.log
echo ======================================== >> scripts\backup.log
echo Inicio: %DATE% %TIME% >> scripts\backup.log

node scripts\backup.mjs >> scripts\backup.log 2>&1

if %ERRORLEVEL% EQU 0 (
    echo Resultado: OK >> scripts\backup.log
) else (
    echo Resultado: FALHOU ^(codigo %ERRORLEVEL%^) >> scripts\backup.log
)

echo Fim: %DATE% %TIME% >> scripts\backup.log

exit /b %ERRORLEVEL%
