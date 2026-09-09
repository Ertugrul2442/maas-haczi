# -*- coding: utf-8 -*-
"""
net_maas.py'nin sonuclarini JSON'a doker; web/kiyas_net_maas.js ayni girdileri
JS portuna verip DEGER DEGER kiyaslar.

NEDEN VAR: net_maas.py bastan sona Decimal kullaniyor, JS'te Decimal yok.
"JS'te de yuvarlama var" deyip gecmenin ne kadar tehlikeli oldugu bu projede
zaten olculdu (bkz. web/yuvarla.js -- Math.round 864 yerde yaniliyordu ve
karardaki gercek dosyada bile kurus kaydiriyordu). Ayni hatayi ondalik
aritmetigin tamaminda tekrarlamamak icin port TAHMINLE degil TARAMAYLA
dogrulaniyor.

Kullanim:
    py -3.13 web/kiyas_net_maas.py > web/kiyas_veri.json
    node web/kiyas_net_maas.js web/kiyas_veri.json

Cikti dosyasi gecicidir, depoya girmez (.gitignore).
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from decimal import Decimal as D

import net_maas as nm

# Asgari ucretin altini, tam asgariyi, ustunu ve SGK TAVANINI asan degerleri
# birlikte taramak sart: tavan kirpmasi ancak orada devreye giriyor ve tam da
# orada bolme (dolayisiyla Decimal'in 28 haneli baglami) isin icine giriyor.
BRUTLER = ["3577.50", "20002.50", "26005.50", "26872.35", "33030.00",
           "40000", "65000", "120000", "500000"]
GUNLER = [30, 23, 17, 7, 1]
KUMULATIFLER = ["0", "1234567.89"]

ALANLAR = ["brut", "sgk", "issizlik", "matrah", "kumulatif", "gelir_vergisi",
           "gv_istisnasi", "odenecek_gv", "damga", "damga_istisnasi",
           "odenecek_damga", "net"]


# Ondalik motorunu (desimal.js) dogrudan sinamak icin. NEDEN AYRICA GEREKLI:
# olculdu ki net_maas'in kendi bolmesi (tavan x gun / 30) HER ZAMAN tam
# cikiyor, yani 28 anlamli haneye ROUND_HALF_EVEN dali gercek veriyle hic
# denenmiyor. 3'e ya da 7'ye bolen bir sey (ileride hesap.js) eklenirse o dal
# sessizce yanlis olabilirdi. Burada bilerek kusuratli bolmeler var.
DES_DEGERLER = ["0", "1", "3", "7", "0.1", "2.5", "0.125", "0.00759",
                "26005.50", "1234567.89", "-3.5", "-0.07", "99999999999.999",
                "0.0000001"]
DES_YUVARLAMA = [("HALF_UP", "ROUND_HALF_UP"), ("DOWN", "ROUND_DOWN"),
                 ("HALF_EVEN", "ROUND_HALF_EVEN")]


def kanon(v):
    """Degeri gosterimden ayiran kanonik yazim: sondaki sifirlar atilir,
    ustel yazim acilir, -0 ile 0 ayni sayilir. 'Deger ayni mi' sorusunun
    cevabi bununla verilir; 'gosterim ayni mi' ayri bir soru."""
    if v == 0:
        return "0"
    return format(v.normalize(), "f")


def des_kayitlari():
    from decimal import ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP
    modlar = {"ROUND_HALF_UP": ROUND_HALF_UP, "ROUND_DOWN": ROUND_DOWN,
              "ROUND_HALF_EVEN": ROUND_HALF_EVEN}
    cikti = []
    for a in DES_DEGERLER:
        for b in DES_DEGERLER:
            x, y = D(a), D(b)
            for islem in ("topla", "cikar", "carp", "bol"):
                if islem == "bol" and y == 0:
                    continue
                sonuc = {"topla": lambda: x + y, "cikar": lambda: x - y,
                         "carp": lambda: x * y, "bol": lambda: x / y}[islem]()
                cikti.append({"tip": "des_islem", "girdi": [a, b, islem],
                              "bekle": [kanon(sonuc)],
                              "gosterim": [str(sonuc)]})
        for js_mod, py_mod in DES_YUVARLAMA:
            cikti.append({
                "tip": "des_yuvarla", "girdi": [a, 2, js_mod],
                "bekle": [str(D(a).quantize(D("0.01"), rounding=modlar[py_mod]))],
            })
    return cikti


def main():
    kayitlar = des_kayitlari()

    # --- 1) aylik_net: genis tarama -------------------------------------
    for yil in range(2021, 2027):
        for ay in range(1, 13):
            for brut in BRUTLER:
                for gun in GUNLER:
                    for sgdp in (False, True):
                        for istisna in (True, False):
                            for kum in KUMULATIFLER:
                                s = nm.aylik_net(brut, yil, ay,
                                                 kumulatif_matrah=kum,
                                                 gun=gun, sgdp=sgdp,
                                                 istisna_var=istisna)
                                kayitlar.append({
                                    "tip": "aylik_net",
                                    "girdi": [brut, yil, ay, kum, gun, sgdp, istisna],
                                    "bekle": [str(s[a]) for a in ALANLAR],
                                })

    # --- 2) _asgari_istisna: istisna takvimi ----------------------------
    for yil in range(2021, 2027):
        kum_asg = D(0)
        for ay in range(1, 13):
            gv, m, dv = nm._asgari_istisna(yil, ay, kum_asg)
            kayitlar.append({
                "tip": "asgari_istisna",
                "girdi": [yil, ay, str(kum_asg)],
                "bekle": [str(gv), str(m), str(dv)],
            })
            kum_asg += m

    # --- 3) sgk_tavan / brut_asgari -------------------------------------
    for yil in range(2021, 2027):
        for ay in range(1, 13):
            kayitlar.append({
                "tip": "tavan",
                "girdi": [yil, ay],
                "bekle": [str(nm.brut_asgari(yil, ay)), str(nm.sgk_tavan(yil, ay))],
            })

    # --- 4) gv_matrahi ---------------------------------------------------
    for yil in range(2021, 2027):
        for ay in (1, 6, 12):
            for brut in BRUTLER:
                for gun in GUNLER:
                    for sgdp in (False, True):
                        kayitlar.append({
                            "tip": "gv_matrahi",
                            "girdi": [brut, yil, ay, gun, sgdp],
                            "bekle": [str(nm.gv_matrahi(brut, yil, ay, gun, sgdp))],
                        })

    # --- 5) yil_bordrosu: kumulatifi kendi tasiyan yol -------------------
    for yil in range(2022, 2027):
        for brut in ["26005.50", "40000", "65000", "120000"]:
            sat = nm.yil_bordrosu(brut, yil)
            kayitlar.append({
                "tip": "yil_bordrosu",
                "girdi": [brut, yil],
                "bekle": [str(s["net"]) for s in sat],
            })

    # --- 6) ceyrek: 1/4 asagi kirpma -------------------------------------
    # Tam yarim (x,xx5) ve tam bolunen degerleri bilerek icine aliyoruz.
    ceyrekler = []
    for tam in range(0, 60000, 137):
        ceyrekler.append("%d.%02d" % (tam, tam % 100))
    ceyrekler += ["28075.50", "22104.67", "0.00", "0.01", "0.02", "0.03",
                  "1.00", "3.99", "10.10", "99999.99"]
    for v in ceyrekler:
        kayitlar.append({
            "tip": "ceyrek",
            "girdi": [v],
            "bekle": [str(nm.ceyrek(v))],
        })

    json.dump(kayitlar, sys.stdout, ensure_ascii=False)
    print()
    sys.stderr.write("%d kayit doküldü\n" % len(kayitlar))
    return 0


if __name__ == "__main__":
    sys.exit(main())
