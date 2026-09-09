# -*- coding: utf-8 -*-
"""
"Her ay farkli borc cikar" kuralinin testi.

Program maas SORMAZ, VARSAYMAZ: her ayin ucreti SGK hizmet dokumunun PEK
sutunundan okunur. Kazanc asgari ucretten farkliysa o ayin net ucreti
kanunun formuluyle hesaplanir (net_maas.py) ve 1/4 ondan alinir. Gelir vergisi
kumulatif matraha gore artan oranli oldugu icin AYNI brut maas yilin ilerleyen
aylarinda daha DUSUK net verir -> her ay farkli 1/4, her ay farkli borc.

Bu dosya bunu yedi ayri acidan olcer. Hicbiri tahmin degil; beklenen rakamlar
ya elle kanun formulunden ya da bagimsiz kaynaktan geliyor.
"""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import net_maas
from hesap import (Ayarlar, Kayit, dokum_oku, hesapla, tutanak_metni,
                   tarih_coz, tl)

KLASOR = os.path.dirname(os.path.abspath(__file__))
XLS = os.path.join(KLASOR, "lll.xls")

hata = []


def kontrol(ad, olcum, beklenen):
    tamam = (olcum == beklenen)
    print("  [{}] {:<52} {}".format("OK" if tamam else "HATA", ad, olcum), end="")
    print("" if tamam else "   <-- BEKLENEN: {}".format(beklenen))
    if not tamam:
        hata.append(ad)
    return tamam


def sahte(isyeri, yil, aylar, pek_aylik, gun=30):
    """Elde gercek ornegi olmayan durumlari olcmek icin sentetik SGK satiri."""
    return [Kayit(kol="4a", isyeri=isyeri, yil=yil, ay=a, gun=gun, giris="",
                  cikis="", eksik_neden="", ad="DENEK", pek=pek_aylik)
            for a in aylar]


# ---------------------------------------------------------------------------
print("=" * 78)
print("1. GERCEK DOSYA -- lll.xls / isyeri 1312704 / Mayis 2025 asgari ustu")
print("=" * 78)
# Mayis 2025'te PEK 26.872,35 (asgari 26.005,50, fark +866,85).
# Beklenen net ve 1/4 kanun formulunden ELLE hesaplandi (bu dosyanin disinda,
# bagimsiz bir betikle):
#   SGK 3.762,13 + issizlik 268,72 -> matrah 22.841,50
#   GV 3.426,23 - istisna 3.315,70 = 110,53 ; damga 203,96 - 197,38 = 6,58
#   net = 26.872,35 - 3.762,13 - 268,72 - 110,53 - 6,58 = 22.724,39
#   1/4 = 5.681,0975 -> asagi kirpma -> 5.681,09
ayarlar = Ayarlar.yukle(os.path.join(KLASOR, "ayarlar.json"))
kayitlar, kisi, _ = dokum_oku(XLS)
t, kr = tarih_coz("10.12.2024"), tarih_coz("31.07.2025")

s_acik = hesapla(kayitlar, "1312704", t, kr, 0, ayarlar, kisi)
mayis_a = [k for k in s_acik.kalemler if (k.yil, k.ay) == (2025, 5)][0]

kontrol("Mayis 2025 kumulatif matrah (Ocak-Nisan)", tl(mayis_a.kumulatif), "88.418,68")
kontrol("Mayis 2025 net (kanun formulu)", tl(mayis_a.net), "22.724,39")
kontrol("Mayis 2025 1/4", tl(mayis_a.ceyrek), "5.681,09")
kontrol("Mayis 2025 net kaynagi", mayis_a.net_kaynak, "pek")
kontrol("Teyitli aylar DEGISMEDI (Ocak 2025)",
        tl([k for k in s_acik.kalemler if (k.yil, k.ay) == (2025, 1)][0].ceyrek),
        "5.526,17")
kontrol("Toplam", tl(s_acik.toplam), "36.698,25")
kontrol("PEK'ten hesaplanan ay sayisi", s_acik.pek_ay_sayisi, 1)

metin = tutanak_metni(s_acik)
kontrol("Tutanak metni PEK cumlesini kuruyor",
        "prime esas kazancına göre hesaplanan net ücreti olan 22.724,39" in metin,
        True)
kontrol("Tutanak o ay icin 'asgari ücret tarifesi' DEMIYOR",
        "asgari ücret tarifesi olan 22.724,39" in metin, False)

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("2. HER AY FARKLI BORC -- 65.000 TL brut, 2026 boyunca sabit")
print("=" * 78)
# Ayni brut maas, kumulatif matrah dilim atladikca daha dusuk net verir.
# Ocak 50.931,18 / Aralik 45.704,95 rakamlari CLAUDE.md'de yazili; burada
# HESAP tarafindan da ayni rakamin uretildigi olculuyor.
k26 = sahte("9999999", 2025, [12], 65000.0) + sahte("9999999", 2026, range(1, 13), 65000.0)
s65 = hesapla(k26, "9999999", tarih_coz("25.12.2025"), tarih_coz("31.12.2026"),
              0, ayarlar, "DENEK")
aylik = {(k.yil, k.ay): k for k in s65.kalemler}

print("  {:<14}{:>13}{:>13}{:>13}".format("AY", "NET", "1/4", "TUTAR"))
for a in range(1, 13):
    k = aylik[(2026, a)]
    print("  {:<14}{:>13}{:>13}{:>13}".format(k.ay_adi, tl(k.net), tl(k.ceyrek),
                                              tl(k.tutar)))

kontrol("Ocak 2026 net", tl(aylik[(2026, 1)].net), "50.931,18")
kontrol("Ocak 2026 1/4", tl(aylik[(2026, 1)].ceyrek), "12.732,79")
kontrol("Aralik 2026 net", tl(aylik[(2026, 12)].net), "45.704,95")
kontrol("Aralik 2026 1/4", tl(aylik[(2026, 12)].ceyrek), "11.426,23")

ceyrekler = [aylik[(2026, a)].ceyrek for a in range(1, 13)]
kontrol("12 ayin 1/4'u AYNI DEGIL (her ay farkli borc)",
        len(set(ceyrekler)) > 1, True)
kontrol("Yil sonunda yil basindan DUSUK", ceyrekler[11] < ceyrekler[0], True)
# DIKKAT -- 1/4 yil boyunca duz inmiyor, TEMMUZ'da bir tik ARTIYOR.
# Sebep bir hata degil, kanunun kendisi: asgari ucretlinin kumulatif matrahi da
# Temmuz'da %20 dilimine geciyor, dolayisiyla GVK 23/1-18 istisnasi
# 4.211,33 -> 4.537,75'e cikiyor (CLAUDE.md'deki istisna takvimi). O ay vergi
# azaliyor, net artiyor. Agustos'ta hem istisna 5.615,10'a cikiyor hem de
# kisinin kendi kumulatifi %27 dilimine giriyor; ikincisi agir basiyor.
# Bu satirlar o "garip" sicramayi kilitliyor ki ileride biri hata sanip
# "duzeltmeye" kalkmasin.
kontrol("Temmuz'da 1/4 ARTIYOR (istisna 4.211,33 -> 4.537,75)",
        ceyrekler[6] > ceyrekler[5], True)
kontrol("Agustos'ta tekrar dusuyor (kisi %27 dilimine giriyor)",
        ceyrekler[7] < ceyrekler[6], True)
kontrol("Temmuz disinda hic artis yok",
        [i + 2 for i in range(11) if ceyrekler[i + 1] > ceyrekler[i]], [7])
kontrol("Butun 2026 aylari PEK'ten hesaplandi",
        sum(1 for a in range(1, 13) if aylik[(2026, a)].net_kaynak == "pek"), 12)
# 0,85 kestirmesi 65.000 x 0,85 / 4 = 13.812,50 derdi. Aralik'ta ne kadar sisirirdi?
kestirme = round(65000 * 0.85 * 0.25, 2)
kontrol("0,85 kestirmesi Aralik'ta ne kadar sisirirdi",
        tl(round(kestirme - aylik[(2026, 12)].ceyrek, 2)), "2.386,27")

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("3. AYNI ANDA IKI ISVEREN -- istisna sadece en yuksek ucrete (GVK 23/1-18)")
print("=" * 78)
ciftli = (sahte("1111111", 2026, [1], 65000.0) +      # yuksek olan
          sahte("2222222", 2026, [1], 40000.0))       # dusuk olan -> istisnasiz
s_yuksek = hesapla(ciftli, "1111111", tarih_coz("25.12.2025"),
                   tarih_coz("31.01.2026"), 0, ayarlar, "DENEK")
s_dusuk = hesapla(ciftli, "2222222", tarih_coz("25.12.2025"),
                  tarih_coz("31.01.2026"), 0, ayarlar, "DENEK")
n_yuksek = s_yuksek.kalemler[0]
n_dusuk = s_dusuk.kalemler[0]
# 40.000 TL brut TEK isverende Ocak 2026'da 33.058,43 net verir (CLAUDE.md).
# Ikinci isveren oldugu icin istisnasi yok -> daha dusuk cikmali.
tek_basina = float(net_maas.aylik_net(40000, 2026, 1)["net"])
kontrol("Yuksek olan istisnadan yararlaniyor", tl(n_yuksek.net), "50.931,18")
kontrol("40.000 tek isverende olsaydi", tl(tek_basina), "33.058,43")
kontrol("Ikinci isverende istisna YOK -> net daha dusuk",
        n_dusuk.net < tek_basina, True)
kontrol("Uyari yazildi (istisna uygulanmadi)",
        any("SADECE en yuksek ucrete" in u for u in s_dusuk.uyarilar), True)

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("4. ESIT MAASLI IKI ISVEREN -- program kendi kafasina gore secmemeli")
print("=" * 78)
esit = sahte("1111111", 2026, [1], 65000.0) + sahte("2222222", 2026, [1], 65000.0)
e1 = hesapla(esit, "1111111", tarih_coz("25.12.2025"), tarih_coz("31.01.2026"),
             0, ayarlar, "DENEK").kalemler[0]
e2 = hesapla(esit, "2222222", tarih_coz("25.12.2025"), tarih_coz("31.01.2026"),
             0, ayarlar, "DENEK").kalemler[0]
kontrol("Esitlikte iki isveren de ayni net aliyor", tl(e1.net) == tl(e2.net), True)
kontrol("Esitlikte istisna VERILIYOR (kimse cezalandirilmiyor)",
        tl(e1.net), "50.931,18")

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("5. TARIFESI OLMAYAN YIL -- sessizce yanlis hesaplamamali, BAGIRMALI")
print("=" * 78)
gelecek = sahte("8888888", 2026, [12], 65000.0) + sahte("8888888", 2027, [1, 2], 65000.0)
s_gel = hesapla(gelecek, "8888888", tarih_coz("25.12.2026"),
                tarih_coz("28.02.2027"), 0, ayarlar, "DENEK")
oc27 = [k for k in s_gel.kalemler if (k.yil, k.ay) == (2027, 1)][0]
# Hesaplanamadigi icin asgari ucret kullanildi AMA satir "asgari" diye
# etiketlenmiyor: "veri-yok" deniyor ki ciktida da, ekranda da tahmin
# oldugu gorunsun. Sessizce dogru gorunmesin.
kontrol("2027 icin net hesaplanamadi, TAHMIN diye isaretlendi",
        oc27.net_kaynak, "veri-yok")
kontrol("Bagiran uyari var (net ucret HESAPLANAMADI)",
        any(u.startswith("!!!") and "HESAPLANAMADI" in u for u in s_gel.uyarilar),
        True)
kontrol("Bayat asgari ucret tablosu uyarisi da var",
        any("ASGARI UCRET TABLOSU ESKI" in u for u in s_gel.uyarilar), True)

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("6. KARARDAKI DOSYA BOZULMADI -- 1336786, 9/9 ay teyitli")
print("=" * 78)
s_karar = hesapla(kayitlar, "1336786", tarih_coz("25.11.2025"),
                  tarih_coz("28.08.2026"), 33121.92, ayarlar, kisi,)
kontrol("Toplam", tl(s_karar.toplam), "37.798,14")
kontrol("Borclandirma", tl(s_karar.borclandirma), "33.121,92")
kontrol("Hicbir ay PEK'ten hesaplanmadi (hepsi tam asgari)",
        s_karar.pek_ay_sayisi, 0)

# ---------------------------------------------------------------------------
print()
print("=" * 78)
print("7. KUMULATIFTE DELIK -- PEK'i olmayan ay sessizce yutulmamali")
print("=" * 78)
# Yil icinde bir ayin PEK'i bos gelirse kumulatif matrah oldugundan DUSUK
# kalir; vergi az, net yuksek, 1/4 yuksek cikar. Program bunu fark edip
# bagirmali -- yoksa hesap sessizce sisik olur.
delikli = (sahte("7777777", 2026, [1, 2], 65000.0) +
           sahte("7777777", 2026, [3], 0.0) +          # PEK'i olmayan ay
           sahte("7777777", 2026, [4, 5], 65000.0))
s_delik = hesapla(delikli, "7777777", tarih_coz("25.12.2025"),
                  tarih_coz("31.05.2026"), 0, ayarlar, "DENEK")
kontrol("Delikli aydan sonraki ay yine PEK'ten hesaplandi",
        [k for k in s_delik.kalemler if (k.yil, k.ay) == (2026, 4)][0].net_kaynak,
        "pek")
kontrol("Kumulatif deligi icin BAGIRAN uyari var",
        any(u.startswith("!!!") and "kumulatif matraha" in u
            for u in s_delik.uyarilar), True)
# Delik olmasa Nisan kumulatifi 3 x 55.250 = 165.750 olurdu; delikle 110.500.
kontrol("Nisan kumulatifi gercekten eksik kaldi",
        tl([k for k in s_delik.kalemler if (k.yil, k.ay) == (2026, 4)][0].kumulatif),
        "110.500,00")
# Delik YOKKEN bu uyari CIKMAMALI (yanlis alarm testi).
temiz = sahte("7777777", 2026, [1, 2, 3, 4, 5], 65000.0)
s_temiz = hesapla(temiz, "7777777", tarih_coz("25.12.2025"),
                  tarih_coz("31.05.2026"), 0, ayarlar, "DENEK")
kontrol("Delik yokken uyari SUSUYOR (yanlis alarm yok)",
        any("kumulatif matraha" in u for u in s_temiz.uyarilar), False)
kontrol("Delik yokken Nisan kumulatifi tam", tl(
    [k for k in s_temiz.kalemler if (k.yil, k.ay) == (2026, 4)][0].kumulatif),
    "165.750,00")

# ---------------------------------------------------------------------------
print()
print("=" * 78)
if hata:
    print(">>> {} KONTROL BASARISIZ:".format(len(hata)))
    for h in hata:
        print("      -", h)
    sys.exit(1)
print(">>> BUTUN KONTROLLER GECTI.")
