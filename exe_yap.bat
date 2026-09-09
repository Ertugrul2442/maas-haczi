@echo off
REM Kodda degisiklik yaptiktan sonra bunu calistir; dagitim klasoru yenilenir.
cd /d "%~dp0"
echo Once test calisiyor...
py -3.13 test_hesap.py
if errorlevel 1 ( echo. & echo KARAR TESTI GECMEDI - exe yapilmadi. & pause & exit /b 1 )
py -3.13 test_net_maas.py
if errorlevel 1 ( echo. & echo NET MAAS TESTI GECMEDI - exe yapilmadi. & pause & exit /b 1 )
py -3.13 test_pekten_net.py
if errorlevel 1 ( echo. & echo PEK-TEN NET TESTI GECMEDI - exe yapilmadi. & pause & exit /b 1 )
py -3.13 test_ilk_ay.py
if errorlevel 1 ( echo. & echo ILK AY TESTI GECMEDI - exe yapilmadi. & pause & exit /b 1 )
py -3.13 test_veri_cek.py
if errorlevel 1 ( echo. & echo VERI CEKICI TESTI GECMEDI - exe yapilmadi. & pause & exit /b 1 )
echo.
echo Test gecti. Exe yapiliyor (1-2 dakika)...
py -3.13 -m PyInstaller --noconfirm --onefile --windowed --name "Maas Haczi" --hidden-import xlrd --hidden-import docx --hidden-import openpyxl --collect-data docx --distpath "dagitim" --workpath "build" --specpath "build" arayuz.py
if errorlevel 1 ( echo. & echo EXE YAPILAMADI. & pause & exit /b 1 )
copy /y ayarlar.json dagitim\ayarlar.json >nul
echo.
echo BITTI. dagitim klasorunu flasa kopyala.
pause
