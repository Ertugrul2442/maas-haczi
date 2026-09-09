"""veri_cek.py'nin guvenlik kontrollerini sinar. AGA CIKMAZ.

Neden ayri test: cekicinin degerli kismi "cekmek" degil, SACMA VERIYI
REDDETMEK. Kaynak bir HTML sayfasi ve bir PDF -- duzenleri degisirse
ayristirici pekala yanlis bir sayi okur. O sayinin ayarlar.json'a sessizce
girmesi bu programdaki en pahali hata olurdu: her dosyanin hesabi bozulur
ve kimse fark etmez.

    py -3.13 test_veri_cek.py
"""
import sys

sys.path.insert(0, ".")
import resmi_kaynak as kaynak
import veri_cek
import net_maas

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

gecen = kalan = 0


def onay(baslik, kosul, ayrinti=""):
    global gecen, kalan
    if kosul:
        gecen += 1
        print("  GECTI  %s" % baslik)
    else:
        kalan += 1
        print("  KALDI  %s   %s" % (baslik, ayrinti))


def reddetmeli(baslik, cagri):
    """cagri() DogrulamaHatasi ya da KaynakHatasi firlatmali."""
    global gecen, kalan
    try:
        cagri()
    except (veri_cek.DogrulamaHatasi, kaynak.KaynakHatasi) as e:
        gecen += 1
        print("  GECTI  %s  -> reddetti: %s" % (baslik, str(e)[:70]))
        return
    except Exception as e:                                        # noqa: BLE001
        kalan += 1
        print("  KALDI  %s  -> yanlis hata turu: %r" % (baslik, e))
        return
    kalan += 1
    print("  KALDI  %s  -> KABUL ETTI, oysa reddetmeliydi" % baslik)


# 2026 verisi, dosyadaki halinin aynisi (kiyas tabani).
MEVCUT = [
    {"baslangic": "2025-01", "net": 22104.67, "ceyrek": 5526.17, "brut": 26005.50},
    {"baslangic": "2026-01", "net": 28075.50, "ceyrek": 7018.87, "brut": 33030.00},
]

print("=" * 74)
print("1) SAGLAM VERI GECMELI")
print("=" * 74)
try:
    veri_cek.dogrula(39600.0, 33660.0, "2027-01", MEVCUT)
    onay("makul 2027 verisi (brut 39.600, net 33.660, +%20)", True)
except veri_cek.DogrulamaHatasi as e:
    onay("makul 2027 verisi", False, str(e))

try:
    veri_cek.dogrula(33030.0, 28075.50, "2026-01", MEVCUT)
    onay("bilinen 2026 verisi (ayni donem, artis kontrolu yok)", True)
except veri_cek.DogrulamaHatasi as e:
    onay("bilinen 2026 verisi", False, str(e))

print()
print("=" * 74)
print("2) BOZUK VERI REDDEDILMELI -- her biri ayri bir kazima hatasi senaryosu")
print("=" * 74)

reddetmeli("net brutten BUYUK (sutunlar karismis)",
           lambda: veri_cek.dogrula(28075.50, 33030.0, "2027-01", MEVCUT))

reddetmeli("net/brut orani sacma (%50 -- yanlis hucre okunmus)",
           lambda: veri_cek.dogrula(40000.0, 20000.0, "2027-01", MEVCUT))

reddetmeli("asgari ucret DUSMUS (hic olmadi)",
           lambda: veri_cek.dogrula(20000.0, 17000.0, "2027-01", MEVCUT))

reddetmeli("artis %200 (rakama fazladan hane girmis)",
           lambda: veri_cek.dogrula(99090.0, 84226.5, "2027-01", MEVCUT))

reddetmeli("donem cok eski (2019)",
           lambda: veri_cek.dogrula(39600.0, 33660.0, "2019-01", MEVCUT))

reddetmeli("donem bicimi bozuk",
           lambda: veri_cek.dogrula(39600.0, 33660.0, "2027", MEVCUT))

reddetmeli("brut sifir",
           lambda: veri_cek.dogrula(0.0, 0.0, "2027-01", MEVCUT))

print()
print("=" * 74)
print("3) TARIFE AYRISTIRICI")
print("=" * 74)

# GIB'in 2026 PDF'inden alinan GERCEK metin (bicimi birebir korundu).
GERCEK_2026 = """Gelir Vergisi Tarifesi 2026
190.000 TL'ye kadar
% 15
400.000 TL'nin 190.000 TL'si icin 28.500 TL, fazlasi
% 20
1.000.000 TL'nin 400.000 TL'si icin 70.500 TL (ucret gelirlerinde 1.500.000
TL'nin 400.000 TL'si icin 70.500 TL), fazlasi
% 27
5.300.000 TL'nin 1.000.000 TL'si icin 232.500 TL (ucret gelirlerinde
5.300.000 TL'nin 1.500.000 TL'si icin 367.500 TL), fazlasi
% 35
5.300.000 TL'den fazlasinin 5.300.000 TL'si icin 1.737.500 TL (ucret
gelirlerinde 5.300.000 TL'den fazlasinin 5.300.000 TL'si icin 1.697.500 TL),
fazlasi
% 40"""

cikan = kaynak.tarife_ayristir(GERCEK_2026, 2026)
beklenen = net_maas.TARIFE[2026]
onay("gercek PDF metni -> net_maas.TARIFE[2026] ile birebir",
     [(None if u is None else int(u), round(o, 4)) for u, o in cikan]
     == [(None if u is None else int(u), round(o, 4)) for u, o in beklenen],
     "cikan=%s" % cikan)

onay("UCRET sutunu secildi (3. dilim 1.500.000, diger gelirin 1.000.000'i degil)",
     int(cikan[2][0]) == 1500000, "cikan=%s" % (cikan[2],))

onay("son dilim ust sinirsiz", cikan[-1][0] is None)

reddetmeli("dilimler artmiyor",
           lambda: kaynak.tarife_ayristir(
               "500.000 TL'ye kadar % 15 100.000 TL'nin ... fazlasi % 20 "
               "200.000 TL'nin ... fazlasi % 27 300.000 ... fazlasi % 35 "
               "fazlasi % 40"))

reddetmeli("oran sacma (%80 son dilim)",
           lambda: kaynak.tarife_ayristir(
               "190.000 TL'ye kadar % 15 400.000 TL'nin ... fazlasi % 20 "
               "1.500.000 TL'nin ... fazlasi % 27 5.300.000 ... fazlasi % 35 "
               "fazlasi % 80"))

reddetmeli("bos metin",
           lambda: kaynak.tarife_ayristir("bir sey yok"))

print()
print("=" * 74)
print("4) 1/4 HESABI -- ASAGI kirpma (IIK 83 ust sinir)")
print("=" * 74)

onay("28.075,50 -> 7.018,87 (yuvarlama 7.018,88 verirdi, daire 87 yazmis)",
     veri_cek._ceyrek(28075.50) == 7018.87, veri_cek._ceyrek(28075.50))
onay("22.104,67 -> 5.526,16 (daire 5.526,17 yazmis -- ELLE duzeltilecek olan)",
     veri_cek._ceyrek(22104.67) == 5526.16, veri_cek._ceyrek(22104.67))

print()
print("=" * 74)
print("5) TARIFE FARKI RAPORU")
print("=" * 74)

eksik, celisen = veri_cek.tarife_farki({2026: list(net_maas.TARIFE[2026])})
onay("gomulu tarifeyle ayni -> celiski YOK", celisen == [] and eksik == [])

bozuk = [(190000, .15), (400000, .20), (1500000, .27), (5300000, .35), (None, .39)]
eksik, celisen = veri_cek.tarife_farki({2026: bozuk})
onay("gomuluden farkli -> CELISKI bildirildi", len(celisen) == 1,
     "celisen=%s" % celisen)

eksik, celisen = veri_cek.tarife_farki({2099: list(net_maas.TARIFE[2026])})
onay("gomulude olmayan yil -> EKSIK bildirildi", eksik == [2099])

satir = veri_cek._tarife_satiri(net_maas.TARIFE[2026])
onay("yapistirilabilir satir uretiliyor",
     satir == "[(190000, .15), (400000, .20), (1500000, .27), "
              "(5300000, .35), (None, .40)]", satir)

print()
print("=" * 74)
print(">>> %d GECTI, %d KALDI" % (gecen, kalan))
print("=" * 74)
sys.exit(0 if kalan == 0 else 1)
