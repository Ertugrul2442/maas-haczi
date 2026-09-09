# -*- coding: utf-8 -*-
"""
Gercek bir icra dairesinin KARAR TENSIP TUTANAGI'na karsi dogrulama.
Kagittaki her satir birebir tutmali; tutmuyorsa test kirilir.

NOT: dogrulama dosyasi (SGK hizmet dokumu) kisisel veri oldugu icin depoda
YOK. Bu test ancak dokumun bulundugu makinede kosar.
"""

import sys
import os

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hesap import (Ayarlar, dokum_oku, isverenleri_listele, hesapla,
                   tutanak_metni, tarih_coz, tl)

XLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lll.xls")

# Kagitta yazan degerler
BEKLENEN = [
    ("Kasım 2025", 5, "921,03"),
    ("Aralık 2025", 30, "5.526,17"),
    ("Ocak 2026", 30, "7.018,87"),
    ("Şubat 2026", 30, "7.018,87"),
    ("Mart 2026", 15, "3.509,43"),
    ("Nisan 2026", 15, "3.509,43"),
    ("Mayıs 2026", 17, "3.977,36"),
    ("Haziran 2026", 14, "3.275,47"),
    ("Temmuz 2026", 13, "3.041,51"),
]
BEKLENEN_TOPLAM = "37.798,14"
BEKLENEN_BORC = "33.121,92"
DOSYA_BORCU = 33121.92


def main():
    ayarlar = Ayarlar.yukle()
    kayitlar, kisi, uy = dokum_oku(XLS)
    print(f"Okunan kayit: {len(kayitlar)}   Kisi: {kisi or '(bos)'}")
    for u in uy:
        print(f"  [okuma uyarisi] {u}")

    teblig = tarih_coz("25.11.2025")
    karar = tarih_coz("28.08.2026")

    isverenler = isverenleri_listele(kayitlar, teblig, karar)
    print("\nTeblig-karar araliginda kaydi olan isverenler:")
    for i in isverenler:
        print("   ", i.etiket())
    assert isverenler, "Hic isveren bulunamadi!"
    secilen = isverenler[0].isyeri
    print(f"\nSecilen (otomatik): {secilen}")
    assert secilen == "1336786", f"Yanlis isveren secildi: {secilen}"

    s = hesapla(kayitlar, secilen, teblig, karar, DOSYA_BORCU, ayarlar, kisi)

    print("\n{:<15} {:>5} {:>12} {:>12}   {}".format("AY", "GUN", "1/4", "TUTAR", "NOT"))
    print("-" * 72)
    hata = 0
    assert len(s.kalemler) == len(BEKLENEN), \
        f"Ay sayisi tutmuyor: {len(s.kalemler)} != {len(BEKLENEN)}"

    for k, (b_ay, b_gun, b_tut) in zip(s.kalemler, BEKLENEN):
        ay = f"{k.ay_adi} {k.yil}"
        isaret = ""
        if ay != b_ay or k.gun != b_gun or tl(k.tutar) != b_tut:
            isaret = f"  <-- KAGIT: {b_ay} {b_gun} gun {b_tut}"
            hata += 1
        print("{:<15} {:>5} {:>12} {:>12}   {}{}".format(
            ay, k.gun, tl(k.ceyrek), tl(k.tutar), k.aciklama, isaret))

    print("-" * 72)
    print(f"{'TOPLAM':<15} {'':>5} {'':>12} {tl(s.toplam):>12}")
    print(f"{'DOSYA BORCU':<15} {'':>5} {'':>12} {tl(s.dosya_borcu):>12}")
    print(f"{'BORCLANDIRMA':<15} {'':>5} {'':>12} {tl(s.borclandirma):>12}")
    print(f"\nCalisma bitisi: {s.calisma_bitisi}   (kagit: 01/08/2026)")

    if s.uyarilar:
        print("\nHesap uyarilari:")
        for u in s.uyarilar:
            print("   -", u)

    if tl(s.toplam) != BEKLENEN_TOPLAM:
        print(f"\nTOPLAM TUTMUYOR: {tl(s.toplam)} != {BEKLENEN_TOPLAM}")
        hata += 1
    if tl(s.borclandirma) != BEKLENEN_BORC:
        print(f"BORCLANDIRMA TUTMUYOR: {tl(s.borclandirma)} != {BEKLENEN_BORC}")
        hata += 1

    print("\n" + "=" * 72)
    print("URETILEN TUTANAK METNI")
    print("=" * 72)
    print(tutanak_metni(s))
    print("=" * 72)

    if hata:
        print(f"\n>>> {hata} FARK VAR — DUZELTILMELI")
        sys.exit(1)
    print("\n>>> KAGITTAKI 9 SATIRIN, TOPLAMIN VE BORCLANDIRMANIN HEPSI BIREBIR TUTTU.")


if __name__ == "__main__":
    main()
