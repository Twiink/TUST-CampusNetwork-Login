@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM Windows Port Checker & Killer
REM
REM EXECUTION ENVIRONMENTS:
REM   - CMD:        check-ports.bat
REM   - PowerShell: .\check-ports.bat
REM
REM CLI BEHAVIOR:
REM   - Default (no args): CHECK ONLY (no killing)
REM       check-ports.bat
REM
REM   - Kill mode:
REM       * Kill on default port list:
REM           check-ports.bat --kill
REM       * Kill on a single port ONLY:
REM           check-ports.bat --kill=3000
REM
REM   - Protection:
REM       * Protect ports from being killed (comma-separated list):
REM           check-ports.bat --kill --protect=3000,5173
REM       * Force killing protected ports (dangerous):
REM           check-ports.bat --kill --protect=3000,5173 --force-protected
REM
REM ============================================================

REM ------------------------------------------------------------
REM Runtime flags (defaults)
REM ------------------------------------------------------------
set "KILL_MODE=0"
set "FORCE_PROTECTED=0"
set "PROTECTED_PORTS="
set "KILL_SINGLE_PORT="

REM ------------------------------------------------------------
REM DEFAULT PORT LIST + COMMENTARY
REM ------------------------------------------------------------
REM
REM Port Reference:
REM   80     : HTTP reverse proxy / web server (nginx, apache)
REM   443    : HTTPS reverse proxy / web server
REM   8080   : Common app HTTP (Spring Boot, Tomcat, dev servers)
REM   8843   : Non-standard HTTPS / admin consoles
REM   3000   : Frontend dev servers (React, Next.js)
REM   5173   : Vite default dev server
REM   8000   : Backend dev (Django, FastAPI, Uvicorn)
REM   9000   : Ops / middleware (Portainer, admin tools)
REM   5432   : PostgreSQL
REM   3306   : MySQL / MariaDB
REM   6379   : Redis
REM   27017  : MongoDB
REM   8081   : Alternate HTTP / secondary instances
REM   7001   : Java admin / WebLogic common
REM   5000   : Backend dev (Flask, local APIs)
REM ------------------------------------------------------------
set "DEFAULT_PORTS=80 443 8080 8843 3000 5173 8000 9000 5432 3306 6379 27017 8081 7001 5000"

REM ------------------------------------------------------------
REM Parse arguments
REM ------------------------------------------------------------
call :PARSE_ARGS %*

REM Decide which ports to check
set "PORTS=%DEFAULT_PORTS%"
if defined KILL_SINGLE_PORT set "PORTS=%KILL_SINGLE_PORT%"

REM ------------------------------------------------------------
REM Header / mode summary
REM ------------------------------------------------------------
call :PRINT_LINE "==========================================" Gray
call :PRINT_LINE "Windows Port Checker" Gray
call :PRINT_LINE "==========================================" Gray
echo.

call :PRINT_LINE "Ports to check:" Gray
call :PRINT_LINE "%PORTS%" Gray
echo.

if defined PROTECTED_PORTS (
  call :PRINT_LINE "Protected ports (skip when killing): %PROTECTED_PORTS%" Yellow
) else (
  call :PRINT_LINE "Protected ports: (none)" Yellow
)

if "%KILL_MODE%"=="1" (
  if defined KILL_SINGLE_PORT (
    call :PRINT_LINE "Mode: CHECK + KILL (single port)" Yellow
  ) else (
    call :PRINT_LINE "Mode: CHECK + KILL (default port list)" Yellow
  )
) else (
  call :PRINT_LINE "Mode: CHECK ONLY" Yellow
)

if "%FORCE_PROTECTED%"=="1" (
  call :PRINT_LINE "WARNING: FORCE killing protected ports is enabled" Red
)

echo.

REM ------------------------------------------------------------
REM Main loop
REM ------------------------------------------------------------
for %%P in (%PORTS%) do (
  call :CHECK_PORT %%P
)

echo.
call :PRINT_LINE "==========================================" Gray
call :PRINT_LINE "Done" Gray
call :PRINT_LINE "==========================================" Gray
echo.
pause
exit /b 0


REM ============================================================
REM FUNCTION: PARSE_ARGS
REM
REM Supported:
REM   --kill
REM   --kill=<port>
REM   --protect=<p1,p2,...>
REM   --force-protected
REM ============================================================
:PARSE_ARGS
:PARSE_LOOP
if "%~1"=="" exit /b 0
set "ARG=%~1"

if /I "%ARG%"=="--force-protected" (
  set "FORCE_PROTECTED=1"
  shift
  goto :PARSE_LOOP
)

if /I "%ARG:~0,10%"=="--protect=" (
  set "PROTECTED_PORTS=%ARG:~10%"
  set "PROTECTED_PORTS=%PROTECTED_PORTS:,= %"
  shift
  goto :PARSE_LOOP
)

if /I "%ARG%"=="--kill" (
  set "KILL_MODE=1"
  shift
  goto :PARSE_LOOP
)

if /I "%ARG:~0,7%"=="--kill=" (
  set "KILL_MODE=1"
  set "KILL_SINGLE_PORT=%ARG:~7%"
  shift
  goto :PARSE_LOOP
)

shift
goto :PARSE_LOOP


REM ============================================================
REM FUNCTION: CHECK_PORT <port>
REM
REM What it does:
REM   - Uses netstat to find TCP LISTENING entries on the port
REM   - Extracts PID from the last column
REM
REM Fixes:
REM   - De-duplicate PIDs safely (no '|' markers, since '|' is pipe in CMD)
REM   - Ignore PID 0 (not meaningful for tasklist/taskkill)
REM
REM De-dup strategy:
REM   - Keep a space-padded list: " 123 456 "
REM   - Membership check: findstr /C:" 123 "
REM ============================================================
:CHECK_PORT
set "PORT=%~1"
set "PIDS="
set "SEEN= "

for /f "tokens=5" %%A in ('netstat -ano -p tcp ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "PID=%%A"

  if not "!PID!"=="0" (
    echo(!SEEN!| findstr /C:" !PID! " >nul
    if errorlevel 1 (
      set "PIDS=!PIDS! !PID!"
      set "SEEN=!SEEN!!PID! "
    )
  )
)

if not defined PIDS (
  call :PRINT_LINE "[OK]   Port %PORT% is free" Green
  exit /b 0
)

call :PRINT_LINE "[BUSY] Port %PORT% is in use. PID(s)=!PIDS!" Red

for %%K in (!PIDS!) do (
  call :SHOW_PROCESS %%K
  if "%KILL_MODE%"=="1" call :MAYBE_KILL %%K %PORT%
)

exit /b 0


REM ============================================================
REM FUNCTION: SHOW_PROCESS <pid>
REM
REM Why cmd /c:
REM   - Running this .bat from PowerShell can introduce quoting differences.
REM   - `cmd /c tasklist /FI "PID eq 1234"` is more consistently parsed.
REM
REM Output:
REM   - Prints tasklist lines in Cyan.
REM   - If no output, prints a hint.
REM ============================================================
:SHOW_PROCESS
set "TPID=%~1"
if "%TPID%"=="" exit /b 0

call :PRINT_LINE "    Process info (PID=%TPID%):" Cyan

set "TL_FILTER=PID eq %TPID%"
set "FOUND_LINE=0"

for /f "usebackq delims=" %%L in (`cmd /c tasklist /FI "%TL_FILTER%" /FO LIST /NH 2^>nul`) do (
  set "FOUND_LINE=1"
  call :PRINT_LINE "      %%L" Cyan
)

if "%FOUND_LINE%"=="0" (
  call :PRINT_LINE "      (No tasklist output. PID may have exited or requires admin.)" DarkGray
)

exit /b 0


REM ============================================================
REM FUNCTION: MAYBE_KILL <pid> <port>
REM
REM Protection rules:
REM   - If port is protected and not forced: skip
REM   - Else: kill
REM ============================================================
:MAYBE_KILL
set "KPID=%~1"
set "KPORT=%~2"
if "%KPID%"=="" exit /b 0

set "IS_PROTECTED=0"
if defined PROTECTED_PORTS (
  for %%X in (%PROTECTED_PORTS%) do (
    if "%%X"=="%KPORT%" set "IS_PROTECTED=1"
  )
)

if "%IS_PROTECTED%"=="1" (
  if "%FORCE_PROTECTED%"=="0" (
    call :PRINT_LINE "    [SKIP] Port %KPORT% is protected. Not killing PID %KPID%." Yellow
    call :PRINT_LINE "           Use --force-protected to override." Yellow
    exit /b 0
  ) else (
    call :PRINT_LINE "    [WARN] Forcing kill on protected port %KPORT% (PID %KPID%)." Yellow
  )
)

call :KILL_PID %KPID% %KPORT%
exit /b 0


REM ============================================================
REM FUNCTION: KILL_PID <pid> <port>
REM ============================================================
:KILL_PID
set "KPID=%~1"
set "KPORT=%~2"
if "%KPID%"=="" exit /b 0

call :PRINT_LINE "    Killing PID %KPID% (port %KPORT%) ..." Yellow
taskkill /PID %KPID% /F >nul 2>&1

if "%ERRORLEVEL%"=="0" (
  call :PRINT_LINE "    [KILLED] PID %KPID% terminated." Green
) else (
  call :PRINT_LINE "    [FAIL]   Could not kill PID %KPID% (try run as Admin)." Red
)
exit /b 0


REM ============================================================
REM FUNCTION: PRINT_LINE "message" Color
REM ============================================================
:PRINT_LINE
powershell -NoProfile -Command "Write-Host '%~1' -ForegroundColor %~2"
exit /b 0
