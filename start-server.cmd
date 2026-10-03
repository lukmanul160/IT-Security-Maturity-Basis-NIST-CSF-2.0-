@echo off
setlocal
title NIST Basis Server
cd /d "%~dp0"
if errorlevel 1 goto directory_error

call npm.cmd start
set "NIST_START_EXIT_CODE=%ERRORLEVEL%"
echo.
echo Server berhenti. Exit code: %NIST_START_EXIT_CODE%
echo Jika ada error, salin pesan di atas sebelum menutup jendela ini.
pause
exit /b %NIST_START_EXIT_CODE%

:directory_error
echo Gagal membuka folder proyek.
pause
exit /b 1
