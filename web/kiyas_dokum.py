# -*- coding: utf-8 -*-
"""
hesap.dokum_oku()'nun (xlrd) sonuclarini JSON'a doker; web/kiyas_dokum.js
AYNI .xls dosyalarini SheetJS ile okuyup alan alan kiyaslar.

NEDEN VAR: burada iki AYRI KUTUPHANE ayni dosyayi okuyor -- masaustunde xlrd,
tarayicida SheetJS. Ikisinin ayni degeri vermesi garanti degil. Bilinen iki
ayrisma noktasi:

  1. HAM DEGER vs BICIMLENMIS METIN. SheetJS her hucrede `v` (ham) ve `w`
     (bicimli) tutuyor; `w` yerel ayara gore "3.577,50" verir. dokum_oku.js
     her yerde `v` kullaniyor, bu kiyas onu kilitliyor.
  2. SAYISAL HUCRE. xlrd float dondurur, hesap.py str() uygular:
     str(1336786.0) -> "1336786.0". JS'te String(1336786) -> "1336786".
     Isyeri numarasi sayisal hucrede gelirse isveren listesi IKIYE bolunurdu.

Ikinci maddenin onemi: lll.xls'te BUTUN hucreler metin, yani gercek dosya bu
yolu HIC calistirmiyor. CLAUDE.md 10 numarali tuzak tam da bunu soyluyor --
"gercek veri genis gorunse bile dar olabilir". O yuzden asagida elle kurulmus
SENTETIK dokumler var; xlwt ile gercek BIFF .xls olarak yaziliyorlar, yani
xlrd de SheetJS de onlari gercek bir dosya olarak okuyor.

Sentetikler KISISEL VERI ICERMEZ -> CI'da kosarlar.
lll.xls kisisel veri icerir -> ciktisi .gitignore'da, CI'da kosmaz.

Kullanim:
    py -3.13 web/kiyas_dokum.py            > web/kiyas_dokum_veri.json
    py -3.13 web/kiyas_dokum.py --sentetik > web/kiyas_dokum_veri.json
    node web/kiyas_dokum.js web/kiyas_dokum_veri.json
"""

import json
import os
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, KOK)

import xlwt

import hesap

DOKUM = os.path.join(KOK, "lll.xls")
CIKTI_KLASOR = os.path.join(KOK, "web", "kiyas_dokum_dosya")

# SGK dokumunun gercek baslik metinleri (lll.xls'ten alindi -- satir ici
# yeni satirlar dahil, cunku _sutunlari_bul startswith ile bakiyor).
B_KOL = "Sgrt. Kolu"
B_AD = "Adı Soyadı"
B_ISYERI = "İşyeri/\nKurum/ \nSandık No"
B_UNITE = "Ünite"
B_DONEM = "Dönem"
B_GIRIS = "Giriş"
B_GUN = "Gün"
B_PEK = "PEK/Bsmk/Dğr/Ek Gösterge"
B_CIKIS = "Çıkış"
B_EKSIK = "Eksik Gün Nedeni"


def yaz_xls(yol, sayfalar):
    """
    sayfalar: [(sayfa_adi, [[hucre, ...], ...]), ...]
    Hucre None ise bos birakilir (xlrd XL_CELL_EMPTY -> ''), str ise metin,
    int/float ise SAYI, bool ise mantiksal olarak yazilir. Tur onemli:
    kiyasin asil amaci sayisal hucrelerin iki tarafta ayni okunmasi.
    """
    kitap = xlwt.Workbook(encoding="utf-8")
    for ad, satirlar in sayfalar:
        sh = kitap.add_sheet(ad)
        for r, satir in enumerate(satirlar):
            for c, deger in enumerate(satir):
                if deger is None:
                    continue
                # (deger, "#,##0.00") ikilisi -> SAYI BICIMI olan hucre.
                # Bu, SheetJS'in `w` alaninin `v`den ayrildigi tek durum.
                if isinstance(deger, tuple):
                    sh.write(r, c, deger[0], xlwt.easyxf(num_format_str=deger[1]))
                else:
                    sh.write(r, c, deger)
    kitap.save(yol)


# --------------------------------------------------------------------------
# Sentetik dokumler -- her biri gercek dokumun UGRAMADIGI bir kod yolu icin
# --------------------------------------------------------------------------

def _baslik_satiri():
    # Gercek dokumdeki sutun sirasinin sadelestirilmisi.
    return [B_KOL, B_AD, B_ISYERI, B_DONEM, B_GIRIS, B_GUN, B_PEK, B_CIKIS,
            B_EKSIK]


def sentetikler():
    d = {}

    # 1) DUZ DURUM -- kiyasin kendisi calisiyor mu (kontrol grubu).
    d["duz"] = [("Sayfa1", [
        ["SGK Hizmet Dokumu"] + [None] * 8,
        _baslik_satiri(),
        ["4a", "ORNEK KISI", "900001", "2026/1", "01.01.2026", "30", "33030.00", "", ""],
        ["4a", "ORNEK KISI", "900001", "2026/2", "", "30", "33030.00", "", ""],
    ])]

    # 2) SAYISAL HUCRE -- xlrd float verir, hesap.py str() uygular.
    #    str(900001.0) == "900001.0"; JS'te String(900001) == "900001".
    #    Bu ayrisma kapatilmazsa isveren numarasi iki tarafta FARKLI cikar.
    #    lll.xls'te hic sayisal hucre YOK, yani bu yol gercek dosyada hic
    #    denenmiyor.
    d["sayisal_hucre"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "ORNEK KISI", 900001, "2026/1", "", 30, 33030.00, "", ""],
        ["4a", "ORNEK KISI", 900001, "2026/2", "", 30.0, 26005.5, "", ""],
        # Gun mantiksal hucre: xlrd int 1/0 dondurur -> str(1) == "1".
        ["4a", "ORNEK KISI", 900001, "2026/3", "", True, 33030.00, "", ""],
    ])]

    # 3) DONEM SAYISAL / BOZUK -- "donem okunamadi" uyari yolu.
    #    Uyari metninde Python'un repr()'i geciyor, JS'te elle taklit edildi.
    d["bozuk_donem"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "K", "900001", 2026.1, "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "2021.8", "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "2021-8", "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "202/8", "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "2021/008", "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "it's/bad", "", "30", "33030.00", "", ""],
        ["4a", "K", "900001", "2021 / 8", "", "30", "33030.00", "", ""],   # bosluk KABUL
        ["4a", "K", "900001", "2021/13", "", "30", "33030.00", "", ""],    # ay 13 KABUL
    ])]

    # 4) TOPLAM SATIRLARI -- yil ozeti, atlanmali.
    d["toplam_satiri"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "K", "900001", "2026/1", "", "30", "33030.00", "", ""],
        ["Toplam", "", "", "", "", "30", "", "", ""],
        ["TOPLAM", "", "", "", "", "30", "", "", ""],
        ["toplam 2026", "", "", "", "", "30", "", "", ""],
        ["4a", "K", "900001", "2026/2", "", "30", "33030.00", "", ""],
    ])]

    # 5) UNITE YEDEGI -- Isyeri sutunu bos, Unite dolu.
    d["unite_yedegi"] = [("Sayfa1", [
        [B_KOL, B_AD, B_ISYERI, B_UNITE, B_DONEM, B_GUN, B_PEK],
        ["4a", "K", "", "UNITE-7", "2026/1", "30", "33030.00"],
        ["4a", "K", "900002", "UNITE-7", "2026/2", "30", "33030.00"],
    ])]

    # 6) EKSIK SUTUN -- PEK, ad, cikis, eksik yok. Zorunlu ucu (kol/donem/gun)
    #    duruyor, gerisi bos string ve pek 0.0 olmali.
    d["eksik_sutun"] = [("Sayfa1", [
        [B_KOL, B_ISYERI, B_DONEM, B_GUN],
        ["4a", "900001", "2026/1", "30"],
        ["4a", "900001", "2026/2", "30"],
    ])]

    # 7) BOZUK SAYI -- gun ve pek okunamayan degerler. int(float(v)) ve
    #    float(v) basarisiz olunca ikisi de 0 olmali, SESSIZCE degil DEGERI 0.
    d["bozuk_sayi"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "K", "900001", "2026/1", "", "abc", "abc", "", ""],
        ["4a", "K", "900001", "2026/2", "", "", "", "", ""],
        ["4a", "K", "900001", "2026/3", "", "30.9", "33030.00", "", ""],  # -> 30
        ["4a", "K", "900001", "2026/4", "", "-5", "1e3", "", ""],
        ["4a", "K", "900001", "2026/5", "", " 30 ", " 33030.00 ", "", ""],
        # "0x1e" -> Python hata (0), JS'in Number()'i 30 derdi. Kalip dar
        # tutuldugu icin ikisi de 0 vermeli.
        ["4a", "K", "900001", "2026/6", "", "0x1e", "0x10", "", ""],
        # "1e2": Python int(float("1e2")) == 100 ama JS parseInt("1e2") == 1.
        # Gercek dokumde boyle bir deger yok; buradaki isi _sayi'nin
        # int(float(...)) oldugunu KILITLEMEK -- mutasyon testinde bu satir
        # olmadan "Math.trunc yerine parseInt" hic yakalanmiyordu.
        ["4a", "K", "900001", "2026/7", "", "1e2", "1e2", "", ""],
    ])]

    # 8) KARISIK KOL -- 4a + 4b + 4c. kol_uyarisi uyarilarin BASINA giriyor.
    d["karisik_kol"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "K", "900001", "2026/1", "", "30", "33030.00", "", ""],
        ["4b", "K", "", "2026/1", "", "30", "33030.00", "", ""],
        ["4c", "K", "900003", "2026/1", "", "30", "33030.00", "", ""],
        ["4d", "K", "900004", "2026/1", "", "30", "33030.00", "", ""],  # taninmaz
    ])]

    # 9) SADECE 4C -- "bu program bu dosyayla hesap YAPAMAZ" dili.
    d["sadece_4c"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4c", "MEMUR", "900005", "2025/7", "", "30", "26005.50", "", ""],
        ["4c", "MEMUR", "900005", "2025/8", "", "30", "26005.50", "", ""],
    ])]

    # 10) BASLIK YOK -- ikisi de AYNI hatayi vermeli.
    d["baslik_yok"] = [("Sayfa1", [
        ["bir", "iki", "uc"],
        ["dort", "bes", "alti"],
    ])]

    # 11) KAYIT YOK -- baslik var, veri satiri yok.
    d["kayit_yok"] = [("Sayfa1", [
        _baslik_satiri(),
        ["Toplam", "", "", "", "", "30", "", "", ""],
    ])]

    # 12) BASLIK 60. SATIRDAN SONRA -- arama 60 satirda kesiliyor, bulunmamali.
    d["baslik_gec"] = [("Sayfa1",
                        [["dolgu"] for _ in range(61)] + [_baslik_satiri()]
                        + [["4a", "K", "900001", "2026/1", "", "30", "33030.00", "", ""]])]

    # 13) IKI SAYFA -- ikisi de SADECE ilk sayfayi okumali.
    d["iki_sayfa"] = [
        ("Ilk", [_baslik_satiri(),
                 ["4a", "ILK SAYFA", "900001", "2026/1", "", "30", "33030.00", "", ""]]),
        ("Ikinci", [_baslik_satiri(),
                    ["4a", "IKINCI", "900009", "2026/1", "", "30", "99999.00", "", ""]]),
    ]

    # 14) BOSLUKLU DEGERLER -- strip() her iki tarafta ayni davranmali.
    d["bosluklu"] = [("Sayfa1", [
        _baslik_satiri(),
        ["  4a  ", "  ORNEK  KISI  ", " 900001 ", " 2026/1 ", "", " 30 ",
         " 33030.00 ", " 15.01.2026 ", " istirahat "],
        ["\t4a\n", "K", "900001\n", "2026/2", "", "30", "33030.00", "", ""],
    ])]

    # 15) BICIMLI SAYI HUCRELERI -- SheetJS'in `w` (bicimlenmis metin) alani
    #     `v`den (ham deger) AYRILIYOR: v=33030, w="33,030.00".
    #     dokum_oku.js her yerde `v` kullaniyor; bu dosya olmadan o tercih
    #     kiyasla KANITLANAMIYOR (10.09.2026 mutasyon testi: kanit yoktu).
    #     Yanlislikla `w` kullanilirsa PEK "33,030.00" olarak okunur,
    #     sayiya cevrilemez ve SESSIZCE 0 olur -- hesabi komple bozar.
    d["bicimli_sayi"] = [("Sayfa1", [
        _baslik_satiri(),
        ["4a", "K", (900001, "0"), "2026/1", "", (30, "0"),
         (33030.00, "#,##0.00"), "", ""],
        ["4a", "K", (900001, "0"), "2026/2", "", (30, "#,##0"),
         (26005.50, "#.##0,00"), "", ""],
        ["4a", "K", (900001, "0"), "2026/3", "", (15, "0"),
         (16515.00, "0.00 ₺"), "", ""],
    ])]

    return d


# --------------------------------------------------------------------------

def oku(yol):
    """dokum_oku'yu calistirir; hata da bir sonuctur, kiyasa girer."""
    try:
        kayitlar, ad, uyarilar = hesap.dokum_oku(yol)
    except Exception as e:                     # noqa: BLE001 -- hata da kiyaslanir
        return {"hata": str(e)}
    return {
        "ad": ad,
        "uyarilar": uyarilar,
        "kayitlar": [
            {"kol": k.kol, "isyeri": k.isyeri, "yil": k.yil, "ay": k.ay,
             "gun": k.gun, "giris": k.giris, "cikis": k.cikis,
             "eksik_neden": k.eksik_neden, "ad": k.ad, "pek": k.pek}
            for k in kayitlar
        ],
    }


def main():
    sadece_sentetik = "--sentetik" in sys.argv

    if os.path.isdir(CIKTI_KLASOR):
        shutil.rmtree(CIKTI_KLASOR)
    os.makedirs(CIKTI_KLASOR)

    durumlar = []

    for ad, sayfalar in sentetikler().items():
        yol = os.path.join(CIKTI_KLASOR, ad + ".xls")
        yaz_xls(yol, sayfalar)
        durumlar.append({"ad": "sentetik:" + ad, "dosya": yol, "beklenen": oku(yol)})

    if not sadece_sentetik:
        if not os.path.exists(DOKUM):
            print("lll.xls yok -- sadece sentetikler uretildi.", file=sys.stderr)
        else:
            durumlar.append({"ad": "gercek:lll.xls", "dosya": DOKUM,
                             "beklenen": oku(DOKUM)})

    print(json.dumps({"durumlar": durumlar}, ensure_ascii=False))
    print(f"{len(durumlar)} durum uretildi "
          f"({'sadece sentetik' if sadece_sentetik else 'sentetik + gercek'}).",
          file=sys.stderr)


if __name__ == "__main__":
    main()
