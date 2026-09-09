"""Resmi kaynaklardan asgari ucret ve gelir vergisi tarifesi okur.

Nafaka projesindeki `tuik_api.py`'nin karsiligi, ama ONEMLI BIR FARKLA:
TUIK'in gercek bir JSON API'si var, burada YOK. Asgari ucret TUIK'te hic
gecmiyor (423 veri setinin katalogu tarandi, "asgari" 0 kez). O yuzden
burada HTML sayfasi ve PDF ayristiriliyor -- daha kirilgan bir yol.

Kirilganligin karsiligi `veri_cek.py`'deki guvenlik kontrolleri: buradan
donen her sey orada makul mu diye sinaniyor, saccmaysa DOSYAYA YAZILMIYOR.

Kaynaklar (ikisi de anahtarsiz, kayitsiz, bedava):
  Asgari ucret : https://www.csgb.gov.tr/poco-pages/asgari-ucret/
                 Calisma Bakanligi'nin kendi sayfasi. Tablo hucrelerinde
                 "ASGARI UCRET" (brut) ve "NET ASGARI UCRET" duz duruyor.
  GV tarifesi  : https://cdn.gib.gov.tr/... gelir-vergisi-tarifesi-<yil>.pdf
                 GIB'in kendi PDF'i, yil dogrudan adreste. Metin katmani var.

Denenip elenen: TUIK databrowser2 (asgari ucret yok), GIB'in
"yararli-bilgiler/gelir-vergisi-tarifesi" HTML sayfasi (rakamlar sayfada yok,
icerik betikle geliyor).
"""
import html
import io
import re
import sys
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

ASGARI_URL = "https://www.csgb.gov.tr/poco-pages/asgari-ucret/"
# DIKKAT: adreste URL kacislari (%2F) var, bu yuzden % ile bicimlendirme
# YAPILMAZ -- {yil} yer tutucusu ve .format() kullaniliyor.
TARIFE_URL = ("https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources"
              "?objectKey=arsiv%2Fyardim-kaynaklar%2Fyararli-bilgiler"
              "%2Fgelir-vergisi-tarifeleri%2Fgelir-vergisi-tarifesi-{yil}.pdf")


class KaynakHatasi(RuntimeError):
    """Cekme ya da ayristirma basarisiz. SESSIZ GECME -- cagiran yakalasin."""


def _indir(url, deneme=3, zaman_asimi=60):
    """Baytlari indirir. Basarisizsa KaynakHatasi -- sessizce bos donmez."""
    son_hata = None
    for i in range(deneme):
        try:
            istek = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(istek, timeout=zaman_asimi) as cevap:
                return cevap.read()
        except Exception as e:                                    # noqa: BLE001
            son_hata = e
            print("  ! indirme hatasi (%d/%d): %s" % (i + 1, deneme, e),
                  file=sys.stderr)
            time.sleep(2 * (i + 1))
    raise KaynakHatasi("Indirilemedi: %s (%s)" % (url, son_hata))


def _sayi(metin):
    """'33.030,00' -> 33030.0 . Turk yazimi: nokta binlik, virgul ondalik."""
    t = metin.strip().replace(".", "").replace(",", ".")
    return float(t)


# Python'un upper()'i Turkce bilmiyor; ayrica Ü/Ç/Ş/Ğ/Ö'yu da duzlestirmemiz
# lazim ki "NET ASGARİ ÜCRET" ile "NET ASGARI UCRET" eslesebilsin.
_TR_DUZ = str.maketrans("ıİğĞüÜşŞöÖçÇâÂîÎûÛ", "iIgGuUsSoOcCaAiIuU")


def _duzle(metin):
    """Turkce harfleri ASCII'ye indirip BUYUK harfe cevirir."""
    return metin.translate(_TR_DUZ).upper()


# ---------------------------------------------------------------------------
# Asgari ucret -- Calisma Bakanligi
# ---------------------------------------------------------------------------

def asgari_ucret():
    """(brut, net, donem_baslangici) dondurur. donem: 'YYYY-MM'.

    Sayfadaki ilk tablo yururlukteki donemi gosteriyor. Donem bilgisi
    sayfadaki '(01.01.2026-31.12.2026)' bicimindeki en yeni araliktan
    okunuyor -- yil ortasi zamlarinda (2022-07, 2023-07 boyleydi) baslangic
    ayi Ocak olmuyor, o yuzden yil degil AY da lazim.
    """
    ham = _indir(ASGARI_URL).decode("utf-8", "replace")

    hucreler = [html.unescape(re.sub(r"<[^>]+>", "", h)).strip()
                for h in re.findall(r"<td[^>]*>(.*?)</td>", ham, re.S)]
    hucreler = [h for h in hucreler if h]

    brut = net = None
    for i, h in enumerate(hucreler[:-1]):
        bas = _duzle(h)
        if bas.startswith("NET ASGARI UCRET") and net is None:
            net = _sayi(hucreler[i + 1])
        elif bas.startswith("ASGARI UCRET") and brut is None:
            brut = _sayi(hucreler[i + 1])

    if brut is None or net is None:
        raise KaynakHatasi(
            "Asgari ucret tablosu okunamadi (brut=%s net=%s, %d hucre). "
            "Sayfanin duzeni degismis olabilir -- ELLE BAK, tahmin etme."
            % (brut, net, len(hucreler)))

    donem = _asgari_donem(ham)
    return brut, net, donem


def _asgari_donem(ham):
    """Sayfadaki en yeni '(01.01.2026-31.12.2026)' araliginin baslangici."""
    duz = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", ham)))
    araliklar = re.findall(
        r"\((\d{2})[./](\d{2})[./](\d{4})\s*-\s*\d{2}[./]\d{2}[./]\d{4}\)", duz)
    if not araliklar:
        raise KaynakHatasi(
            "Asgari ucret sayfasinda donem araligi bulunamadi. Hangi doneme "
            "ait oldugu bilinmeyen rakam YAZILMAZ.")
    enler = max((int(y), int(a)) for _, a, y in araliklar)
    return "%04d-%02d" % enler


# ---------------------------------------------------------------------------
# Gelir vergisi tarifesi -- GIB
# ---------------------------------------------------------------------------

def gelir_vergisi_tarifesi(yil):
    """O yilin UCRET tarifesi: [(ust_sinir, oran), ...], son dilim (None, oran).

    GVK 103'un ucret sutunu kullaniliyor. PDF metninde ucret dilimleri
    parantez icinde "(ucret gelirlerinde 1.500.000 TL'nin ...)" diye ayrica
    yaziliyor; parantez varsa ORADAN, yoksa dilimin kendi sayisindan
    okunuyor. Ucret ve diger gelir tarifesini karistirmak yuksek maaslarda
    yanlis vergi verir -- bu yuzden ayrica dogrulaniyor.
    """
    try:
        import fitz                                              # PyMuPDF
    except ImportError as e:
        raise KaynakHatasi(
            "PyMuPDF (fitz) kurulu degil, PDF okunamiyor. "
            "py -3.13 -m pip install pymupdf") from e

    ham = _indir(TARIFE_URL.format(yil=yil))
    if not ham.startswith(b"%PDF"):
        raise KaynakHatasi(
            "%d tarifesi PDF degil (%d bayt geldi). Yil yayimlanmamis "
            "olabilir." % (yil, len(ham)))

    with fitz.open(stream=ham, filetype="pdf") as belge:
        metin = "\n".join(sayfa.get_text() for sayfa in belge)

    return tarife_ayristir(metin, yil)


def tarife_ayristir(metin, yil=None):
    """PDF metnini dilim listesine cevirir. Agdan bagimsiz -- test edilebilir."""
    duz = re.sub(r"\s+", " ", metin)

    parcalar = re.split(r"%\s*(\d{1,2})", duz)
    # parcalar: [onsoz, oran1, metin1, oran2, metin2, ...]
    if len(parcalar) < 5:
        raise KaynakHatasi(
            "Tarife metninde dilim bulunamadi%s."
            % ("" if yil is None else " (%d)" % yil))

    dilimler = []
    for i in range(1, len(parcalar) - 1, 2):
        oran = int(parcalar[i])
        onceki = parcalar[i - 1]
        # Ucret gelirlerine ozel sinir varsa O gecerli.
        yer = onceki.lower().rfind("ücret gelirlerinde")
        if yer == -1:
            yer = onceki.lower().rfind("ucret gelirlerinde")
        aday = onceki[yer:] if yer != -1 else onceki
        sayilar = re.findall(r"\d{1,3}(?:\.\d{3})+", aday)
        ust = _sayi(sayilar[0]) if sayilar else None
        dilimler.append((ust, oran / 100.0))

    # Son dilim ust sinirsiz: metinde "fazlasi" ile bitiyor.
    if dilimler:
        dilimler[-1] = (None, dilimler[-1][1])

    _tarife_dogrula(dilimler, yil)
    return dilimler


def _tarife_dogrula(dilimler, yil):
    """Sacma tarife DOSYAYA YAZILMASIN diye burada duruyor."""
    etiket = "" if yil is None else " (%d)" % yil
    if len(dilimler) < 4:
        raise KaynakHatasi("Tarife%s sadece %d dilim -- eksik okunmus."
                           % (etiket, len(dilimler)))
    if dilimler[-1][0] is not None:
        raise KaynakHatasi("Tarife%s son dilimi ust sinirli olamaz." % etiket)

    onceki_ust = 0
    for ust, oran in dilimler[:-1]:
        if ust is None:
            raise KaynakHatasi("Tarife%s ara diliminin ust siniri okunamadi."
                               % etiket)
        if ust <= onceki_ust:
            raise KaynakHatasi(
                "Tarife%s dilimleri artmiyor: %s -> %s" % (etiket, onceki_ust, ust))
        onceki_ust = ust

    oranlar = [o for _, o in dilimler]
    if oranlar != sorted(oranlar):
        raise KaynakHatasi("Tarife%s oranlari artan degil: %s" % (etiket, oranlar))
    if not (0.10 <= oranlar[0] <= 0.20 and 0.30 <= oranlar[-1] <= 0.50):
        raise KaynakHatasi(
            "Tarife%s oranlari makul araligin disinda: %s" % (etiket, oranlar))


if __name__ == "__main__":
    print("Asgari ucret cekiliyor...")
    b, n, d = asgari_ucret()
    print("  donem %s   brut %.2f   net %.2f   1/4 %.2f"
          % (d, b, n, int(n / 4 * 100) / 100.0))
    yil = int(sys.argv[1]) if len(sys.argv) > 1 else int(d[:4])
    print("Gelir vergisi tarifesi cekiliyor (%d)..." % yil)
    for ust, oran in gelir_vergisi_tarifesi(yil):
        print("  %-12s %%%d" % ("ustu" if ust is None else "%.0f" % ust, oran * 100))
