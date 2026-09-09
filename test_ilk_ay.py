# -*- coding: utf-8 -*-
"""
TEBLIG AYI (ilk ay) kuralinin testi -- 02.09.2026'da adliyeden alindi.

Kural iki yarimdan olusuyor:

  (a) SGK dokumunde kac gun yazarsa yazsin, teblig ayinda TEBLIGDEN SONRAKI
      gunler sayilir:  gun = 30 - teblig.gunu.  Tebligden onceki calisma
      isvereni ilgilendirmez, o gunlerde kesme yukumlulugu yoktu.

  (b) "Tebligden sonra kalan gun, o ay calistigi gunden buyukse o ay
      borclandirilmaz."  Sebep: SGK dokumu o ay KAC GUN sigortali oldugunu
      soyler, HANGI GUNLER oldugunu SOYLEMEZ. Adam o ay 3 gun calismis ve
      teblig ayin 25'inde geldiyse, o 3 gun buyuk ihtimalle ayin basindadir --
      teblig geldiginde isyerinde degildi. Ortustugu kanitlanamadigi icin
      isveren lehine karar veriliyor.

Ikisi birlikte:  gun < kalan  ->  ay hic yazilmaz
                 gun >= kalan ->  gun = kalan
"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hesap import Ayarlar, Kayit, dokum_oku, hesapla, tarih_coz, tl

KLASOR = os.path.dirname(os.path.abspath(__file__))
ayarlar = Ayarlar.yukle(os.path.join(KLASOR, "ayarlar.json"))
hata = []


def kontrol(ad, olcum, beklenen):
    tamam = (olcum == beklenen)
    print("  [{}] {:<54} {}".format("OK" if tamam else "HATA", ad, olcum), end="")
    print("" if tamam else "   <-- BEKLENEN: {}".format(beklenen))
    if not tamam:
        hata.append(ad)


def sahte(yil_ay_gun, isyeri="5555555", pek_gunluk=1101.0):
    """[(yil, ay, gun), ...] -> Kayit listesi. PEK gun basina asgari ucret."""
    return [Kayit(kol="4a", isyeri=isyeri, yil=y, ay=a, gun=g, giris="",
                  cikis="", eksik_neden="", ad="DENEK", pek=pek_gunluk * g)
            for y, a, g in yil_ay_gun]


def ilk_ay(teblig, sgk_gun, karar="31.03.2026"):
    """Teblig ayinda sgk_gun gun calismis biri. (kalem_sayisi, ilk_kalem, sonuc)"""
    kay = sahte([(2026, 1, sgk_gun), (2026, 2, 30), (2026, 3, 30)])
    s = hesapla(kay, "5555555", tarih_coz(teblig), tarih_coz(karar),
                0, ayarlar, "DENEK")
    return len(s.kalemler), s.kalemler[0], s


# ---------------------------------------------------------------------------
print("=" * 80)
print("1. gun > kalan  ->  kalan gun uzerinden hesaplanir")
print("=" * 80)
# Teblig 25 Ocak -> kalan 5. Adam 30 gun calismis. 30 > 5, ay yazilir, 5 gun.
n, k, s = ilk_ay("25.01.2026", 30)
kontrol("Ay sayisi (Ocak dahil)", n, 3)
kontrol("Ilk kalem Ocak", (k.ay_adi, k.yil), ("Ocak", 2026))
kontrol("Hesaba giren gun = 30 - 25", k.gun, 5)
kontrol("Aciklama teblig gununu yaziyor", k.aciklama, "tebliğ 25'inde, ayın kalanı")
kontrol("Tutar = 7.018,87 / 30 x 5", tl(k.tutar), "1.169,81")

print()
print("=" * 80)
print("2. gun = kalan  ->  ay YAZILIR (kural 'buyukse' diyor, esitse degil)")
print("=" * 80)
# Teblig 25 Ocak -> kalan 5. Adam tam 5 gun calismis. Esitlik ay yazilir.
n, k, s = ilk_ay("25.01.2026", 5)
kontrol("Ay sayisi (Ocak dahil)", n, 3)
kontrol("Ilk kalem Ocak", (k.ay_adi, k.yil), ("Ocak", 2026))
kontrol("Hesaba giren gun", k.gun, 5)
kontrol("Atlama uyarisi YOK",
        any("hesaba KATILMADI" in u for u in s.uyarilar), False)

print()
print("=" * 80)
print("3. gun < kalan  ->  AY HIC YAZILMAZ")
print("=" * 80)
# Teblig 25 Ocak -> kalan 5. Adam sadece 3 gun calismis. 5 > 3 -> Ocak dusuyor.
n, k, s = ilk_ay("25.01.2026", 3)
kontrol("Ay sayisi (Ocak DUSTU)", n, 2)
kontrol("Ilk kalem artik Subat", (k.ay_adi, k.yil), ("Şubat", 2026))
kontrol("Neden atlandigi uyarilarda yaziyor",
        any("hesaba KATILMADI" in u and "Ocak" in u for u in s.uyarilar), True)
kontrol("Uyari sayilari dogru veriyor",
        any("kalan gun (5) SGK gununden (3) FAZLA".replace(" ", "")
            in u.replace(" ", "") for u in s.uyarilar), True)
# Eski davranis 3 gun uzerinden 701,88 TL yazardi; artik 0.
kontrol("Toplam sadece Subat + Mart", tl(s.toplam), "14.037,74")

print()
print("=" * 80)
print("4. Teblig ayin 30'unda ya da sonrasinda -> ay zaten yok (eski kural)")
print("=" * 80)
n, k, s = ilk_ay("30.01.2026", 30)
kontrol("Ay sayisi (Ocak dustu)", n, 2)
kontrol("Ilk kalem Subat", (k.ay_adi, k.yil), ("Şubat", 2026))
kontrol("Sebep uyarilarda", any("gun kalmadi" in u for u in s.uyarilar), True)

print()
print("=" * 80)
print("5. GERCEK DOSYA -- lll.xls / 1312704, Aralik 2024'te 20 gunle ise basliyor")
print("=" * 80)
kay, kisi, _ = dokum_oku(os.path.join(KLASOR, "lll.xls"))
# Teblig 05.12.2024 -> kalan 25. Adam Aralik'ta 20 gun calismis. 25 > 20.
s5 = hesapla(kay, "1312704", tarih_coz("05.12.2024"), tarih_coz("31.07.2025"),
             0, ayarlar, kisi)
kontrol("Aralik 2024 hesaba GIRMEDI",
        any((k.yil, k.ay) == (2024, 12) for k in s5.kalemler), False)
kontrol("Ilk kalem Ocak 2025",
        (s5.kalemler[0].ay_adi, s5.kalemler[0].yil), ("Ocak", 2025))
kontrol("Uyari yazildi",
        any("Aralık 2024 (teblig ayi)" in u for u in s5.uyarilar), True)
# Teblig 05.12.2024 yerine 09.12.2024 olsaydi kalan 21 > 20, yine dusrdu.
# 10.12.2024 olsaydi kalan 20 = 20, ay YAZILIRDI. Sinir tam burada.
s5b = hesapla(kay, "1312704", tarih_coz("10.12.2024"), tarih_coz("31.07.2025"),
              0, ayarlar, kisi)
kontrol("Teblig 10.12 -> kalan 20 = SGK 20, ay YAZILIR",
        (s5b.kalemler[0].ay_adi, s5b.kalemler[0].yil, s5b.kalemler[0].gun),
        ("Aralık", 2024, 20))

print()
print("=" * 80)
print("6. KARARDAKI DOSYA BOZULMADI -- 1336786, teblig 25.11.2025")
print("=" * 80)
s6 = hesapla(kay, "1336786", tarih_coz("25.11.2025"), tarih_coz("28.08.2026"),
             33121.92, ayarlar, kisi)
kontrol("Kasim 2025 hesapta", (s6.kalemler[0].ay_adi, s6.kalemler[0].gun),
        ("Kasım", 5))
kontrol("Toplam", tl(s6.toplam), "37.798,14")
kontrol("Borclandirma", tl(s6.borclandirma), "33.121,92")

print()
print("=" * 80)
if hata:
    print(">>> {} KONTROL BASARISIZ:".format(len(hata)))
    for h in hata:
        print("      -", h)
    sys.exit(1)
print(">>> BUTUN KONTROLLER GECTI.")
