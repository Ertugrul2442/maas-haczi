# -*- coding: utf-8 -*-
"""
net_maas.py dogrulamasi. Kendi kendini tebrik etmiyor; disaridan gelen,
resmi olarak yayimlanmis rakamlara karsi olcuyor.

OLCUT 1 (en guclusu): asgari ucretin kendisi. Devlet her donem icin NET
asgari ucreti yayimliyor. Hesap, 2022-2026 arasi 60 ayin 60'inda da bu
yayimlanmis rakami kurusu kurusuna vermeli. Kumulatif matrah yil icinde
dilim atlattigi halde net degismemeli (istisna tam olarak vergiyi siliyor).

OLCUT 2: asgari ucret istisna tutarlari. Bagimsiz kaynaklarda yayimlanan
2026 rakamlari -- Ocak 4.211,33 / Temmuz 4.537,75 / Agustos 5.615,10 --
hesabin sifirdan urettigiyle ayni cikmali. Temmuz/Agustos gecisi kritik:
asgari ucretlinin kumulatif matrahi Temmuz'da %20 dilimine giriyor.

OLCUT 3: damga vergisi istisnasi 2026 icin 250,70 TL.

OLCUT 4: 'brut x 0,85' kestirmesinin asgari ucret USTUNDE ne kadar saptigi.
Bu bir dogrulama degil, olculmus fark -- rapor icin.
"""

import os
import sys
from decimal import Decimal as D

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from net_maas import (ASGARI_BRUT, brut_asgari, aylik_net, yil_bordrosu,
                      _asgari_istisna, ceyrek)

# Resmi olarak yayimlanmis NET asgari ucretler (donem basi -> net)
NET_ASGARI = {
    ("2022-01"): "4253.40", ("2022-07"): "5500.35",
    ("2023-01"): "8506.80", ("2023-07"): "11402.32",
    ("2024-01"): "17002.12",
    ("2025-01"): "22104.67",
    ("2026-01"): "28075.50",
}

# 2026 asgari ucret istisna tutarlari (bagimsiz kaynaklardan)
ISTISNA_2026 = {1: "4211.33", 6: "4211.33", 7: "4537.75", 8: "5615.10", 12: "5615.10"}
DAMGA_ISTISNA_2026 = "250.70"


def _donem_anahtari(yil, ay):
    an, sec = "%04d-%02d" % (yil, ay), None
    for bas, _ in ASGARI_BRUT:
        if bas <= an:
            sec = bas
    return sec


def olcut1():
    print("=" * 72)
    print("OLCUT 1 - Asgari ucret: 60 ayin hepsi resmi net rakamini veriyor mu?")
    print("=" * 72)
    gecen = toplam = 0
    for yil in (2022, 2023, 2024, 2025, 2026):
        # asgari ucret yil ortasinda degisebildigi icin ay ay kurulur
        kum, kum_asg = D(0), D(0)
        hatali = []
        for ay in range(1, 13):
            ba = brut_asgari(yil, ay)
            s = aylik_net(ba, yil, ay, kumulatif_matrah=kum, kumulatif_asgari=kum_asg)
            bekle = D(NET_ASGARI[_donem_anahtari(yil, ay)])
            toplam += 1
            if s["net"] == bekle:
                gecen += 1
            else:
                hatali.append("    ay %2d: %s  !=  beklenen %s" % (ay, s["net"], bekle))
            kum = s["kumulatif"]
            _, m, _ = _asgari_istisna(yil, ay, kum_asg)
            kum_asg += m
        print("  %d : %s" % (yil, "12/12 TAMAM" if not hatali else "HATA"))
        for h in hatali:
            print(h)
    print("  --> %d/%d ay" % (gecen, toplam))
    return gecen == toplam


def olcut2():
    print()
    print("=" * 72)
    print("OLCUT 2/3 - 2026 asgari ucret istisna tutarlari (GV ve damga)")
    print("=" * 72)
    print("  %-4s %-14s %-14s %s" % ("Ay", "GV istisnasi", "DV istisnasi", "kontrol"))
    kum_asg, ok = D(0), True
    for ay in range(1, 13):
        gv, m, dv = _asgari_istisna(2026, ay, kum_asg)
        not_ = ""
        if ay in ISTISNA_2026:
            bekle = D(ISTISNA_2026[ay])
            iyi = (gv == bekle)
            ok = ok and iyi
            not_ = "beklenen %s  %s" % (bekle, "TAMAM" if iyi else "HATA")
        if dv != D(DAMGA_ISTISNA_2026):
            ok = False
            not_ += "  DAMGA HATA (%s)" % dv
        print("  %-4d %-14s %-14s %s" % (ay, gv, dv, not_))
        kum_asg += m
    return ok


def olcut4():
    print()
    print("=" * 72)
    print("OLCUT 4 - 'brut x 0,85' kestirmesi asgari ucret USTUNDE ne kadar sapiyor?")
    print("=" * 72)
    for brut in (40000, 65000, 120000):
        sat = yil_bordrosu(brut, 2026)
        kestirme = D(brut) * D("0.85")
        ocak, aralik = sat[0]["net"], sat[-1]["net"]
        print("  Brut %s TL/ay:" % format(brut, ",d"))
        print("    Ocak neti    %12s   1/4 = %10s" % (ocak, ceyrek(ocak)))
        print("    Aralik neti  %12s   1/4 = %10s" % (aralik, ceyrek(aralik)))
        print("    x0,85        %12s   1/4 = %10s   <-- Ocak'ta %s TL, "
              "Aralik'ta %s TL FAZLA"
              % (kestirme, ceyrek(kestirme), kestirme - ocak, kestirme - aralik))
    return True


def olcut5():
    print()
    print("=" * 72)
    print("OLCUT 5 - Asgari ucretlide 'brut x 0,85' NEDEN tutuyor?")
    print("=" * 72)
    for bas, br in ASGARI_BRUT:
        yil, ay = int(bas[:4]), int(bas[5:])
        if yil < 2022:
            print("  %s  brut %-10s  ->  0,85 kurali GECERSIZ (AGI donemi)" % (bas, br))
            continue
        s = aylik_net(D(br), yil, ay, kumulatif_matrah=0)
        yak = (D(br) * D("0.85")).quantize(D("0.01"))
        print("  %s  brut %-10s  net %-11s  x0,85 = %-11s  fark %s"
              % (bas, br, s["net"], yak, s["net"] - yak))
    print("  Sebep: istisna geliri vergiyi ve damgayi TAM siliyor, geriye sadece")
    print("  %14 SGK + %1 issizlik = %15 kesinti kaliyor. 1 - 0,15 = 0,85.")
    return True


def olcut6():
    """ceyrek() gercekten 4'e boluyor mu, ve daireyle tutuyor mu?

    Bu test bosuna degil: ilk yazimda ceyrek() 4'e BOLMEYI unutmus, sadece
    kirpiyordu ve ciktida net'in kendisi '1/4' diye gorunuyordu. Sessiz hata.
    """
    print()
    print("=" * 72)
    print("OLCUT 6 - ceyrek(): 1/4 asagi kirpma, dairenin rakamiyla ayni mi?")
    print("=" * 72)
    ok = ceyrek("28075.50") == D("7018.87")
    print("  2026: net 28.075,50 -> 1/4 = %s   beklenen 7018.87 (tutanaktaki rakam)  %s"
          % (ceyrek("28075.50"), "TAMAM" if ok else "HATA"))

    # ---- Bilincli olarak testi KIRMIYORUZ ama gormezden de gelmiyoruz ----
    print()
    print("  !! DAIRE KENDI ICINDE TUTARSIZ -- ceyrek() iki yili birden veremez:")
    print("     2026: 28.075,50 / 4 = 7.018,875  -> daire 7.018,87 (ASAGI kirpmis)")
    print("     2025: 22.104,67 / 4 = 5.526,1675 -> daire 5.526,17 (YUKARI yuvarlamis)")
    print("     ceyrek() asagi kirpar, yani 2025 icin 5.526,16 der; daire 5.526,17 demis.")
    print("     Bu bir kod hatasi DEGIL: daire muhtemelen kendi bolmuyor, avukat")
    print("     sitelerinde yayimlanan 'maksimum kesinti' tablosunu kopyaliyor ve o")
    print("     tablolar da tutarli yuvarlamiyor. hesap.py bu yuzden ayarlar.json'daki")
    print("     ELLE yazilmis 'ceyrek' degerini kullanir -- dogru tasarim, boyle kalsin.")
    print("     ceyrek() sadece ayarlar.json'da kayit YOKSA yaklasik deger icindir.")
    return ok


def main():
    sonuc = [("Olcut 1 (60 ay net asgari ucret)", olcut1()),
             ("Olcut 2/3 (2026 istisna tutarlari)", olcut2()),
             ("Olcut 6 (ceyrek 1/4 kirpmasi)", olcut6())]
    olcut4()
    olcut5()
    print()
    print("=" * 72)
    for ad, ok in sonuc:
        print("  %-40s %s" % (ad, "GECTI" if ok else "KALDI"))
    print("=" * 72)
    return 0 if all(ok for _, ok in sonuc) else 1


if __name__ == "__main__":
    sys.exit(main())
