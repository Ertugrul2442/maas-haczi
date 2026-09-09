@echo off
cd /d "%~dp0"
start "" pyw -3.13 arayuz.py
if errorlevel 1 (
  echo.
  echo Python 3.13 bulunamadi. Kurulu mu?  py -3.13 --version
  pause
)
