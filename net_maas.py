# -*- coding: utf-8 -*-
"""
Brutten nete ucret hesabi -- kanuna gore, tahminle degil.

NEDEN VAR: IIK 83'teki 1/4, NET ucret uzerinden hesaplanir. Asgari ucretlide
net rakam zaten yayimlanmis oluyor; asgari ucretin USTUNDE bir kazanc varsa
"brut x 0,85" kestirmesi YANLIS sonuc verir (2026'da 65.000 TL brutte aylik
4.318 - 9.545 TL sisirir, olculdu). Bu modul net'i kanunun kendi kurallariyla
hesaplar.

DAYANAK (hepsi resmi kaynaktan okundu, 02.09.2026):
  - GVK m.103  : gelir vergisi tarifesi (GIB'in yil yil yayimladigi PDF'ler)
  - GVK 23/1-18: asgari ucret gelir vergisi istisnasi (7349 s.K. ile, 1/1/2022)
  - 319 s. Teblig m.5-6: istisnanin nasil uygulanacagi
  - 488 s. DVK (2) sayili tablo IV/34: asgari ucret damga vergisi istisnasi
  - 5510 s.K. m.80 + SGK genelgeleri: prime esas kazanc alt/ust siniri

FORMUL (bir ay icin):
  SGK isci payi   = min(brut, tavan) x %14
  Issizlik payi   = min(brut, tavan) x %1
  GV matrahi      = brut - SGK - issizlik
  Hesaplanan GV   = tarife(kumulatif + matrah) - tarife(kumulatif)
  Istisna GV      = o ay asgari ucret uzerinden hesaplanacak vergi (asamaz)
  Damga           = brut x binde 7,59 ; istisnasi brut asgari ucretin damgasi
  NET             = brut - SGK - issizlik - odenecek GV - odenecek damga

KUMULATIF MATRAH: vergi yil basindan biriken matraha gore artan oranli
hesaplanir. Yani AYNI brut maas, yilin ilerleyen aylarinda daha DUSUK net
verir. Tek bir "net maas" rakami yoktur; ayin numarasi girdinin parcasidir.

Bu dosya arayuzden ve hesap.py'den bagimsizdir, tek basina test edilebilir.
"""

from decimal import Decimal as D, ROUND_DOWN, ROUND_HALF_UP

__all__ = ["TARIFE", "ASGARI_BRUT", "brut_asgari", "sgk_tavan", "aylik_net",
            "yil_bordrosu", "ceyrek", "gv_matrahi", "NetMaasHatasi"]


class NetMaasHatasi(ValueError):
    """Tanimli olmayan yil/donem istendiginde -- sessizce yanlis hesaplamamak icin."""


def _k(x):
    """Kurusa yuvarla, yarim yukari. Bordro pratigi budur.

    NOT: hesap.py'deki 1/4 kirpmasiyla karistirma. Orada 1/4 yasal UST SINIR
    oldugu icin ASAGI kirpiliyor (7.018,875 -> 7.018,87). Burada ise
    kesintiler yuvarlaniyor; asagi kirpsak resmi net asgari ucret tutmuyor.
    """
    return D(str(x)).quantize(D("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# GVK m.103 tarifesi -- UCRET gelirleri icin
# Kaynak: GIB "Gelir Vergisi Tarifesi <yil>" PDF'leri, 02.09.2026'da indirildi.
# Ucret gelirlerinde 3. ve 4. dilim sinirlari diger gelirlerden FARKLI; burada
# ucret sutunu kullanildi.
# (dilim ust siniri, oran) -- son dilim ust sinirsiz (None)
# ---------------------------------------------------------------------------
TARIFE = {
    2021: [(24000, .15), (53000, .20), (190000, .27), (650000, .35), (None, .40)],
    2022: [(32000, .15), (70000, .20), (250000, .27), (880000, .35), (None, .40)],
    2023: [(70000, .15), (150000, .20), (550000, .27), (1900000, .35), (None, .40)],
    2024: [(110000, .15), (230000, .20), (870000, .27), (3000000, .35), (None, .40)],
    2025: [(158000, .15), (330000, .20), (1200000, .27), (4300000, .35), (None, .40)],
    2026: [(190000, .15), (400000, .20), (1500000, .27), (5300000, .35), (None, .40)],
}

# Damga vergisi: binde 7,59 (488 s.K.)
DAMGA_ORANI = D("0.00759")

# Brut asgari ucret donemleri. Yil ortasi zamlari ayri kayit.
# ayarlar.json'daki "brut" degerleriyle ayni; burada bagimsiz durmasi bilincli
# (bu modul hesap.py'siz de calisabilmeli).
ASGARI_BRUT = [
    ("2021-01", "3577.50"),
    ("2022-01", "5004.00"),
    ("2022-07", "6471.00"),
    ("2023-01", "10008.00"),
    ("2023-07", "13414.50"),
    ("2024-01", "20002.50"),
    ("2025-01", "26005.50"),
    ("2026-01", "33030.00"),
]

# SGK prime esas kazanc tavani = gunluk asgari ucretin N kati.
# 2026'dan itibaren 7,5 -> 9 kata cikti (2026 icin aylik tavan 297.270 TL,
# SGK'nin kendi "Prime Esas Kazanc Miktarlari" sayfasindan dogrulandi).
TAVAN_KAT = [("2021-01", "7.5"), ("2026-01", "9")]


def _donem_sec(tablo, yil, ay, ne):
    an, sec = "%04d-%02d" % (yil, ay), None
    for bas, deg in tablo:
        if bas <= an:
            sec = deg
    if sec is None:
        raise NetMaasHatasi(
            "%s donemi icin %s tanimli degil -- net_maas.py'ye eklenmeli." % (an, ne))
    return D(sec)


def brut_asgari(yil, ay):
    """O ayda gecerli BRUT asgari ucret (aylik, 30 gun)."""
    return _donem_sec(ASGARI_BRUT, yil, ay, "asgari ucret")


def sgk_tavan(yil, ay):
    """O ayin prime esas kazanc ust siniri (aylik, 30 gun)."""
    return brut_asgari(yil, ay) * _donem_sec(TAVAN_KAT, yil, ay, "SGK tavan kati")


def _tarife_vergisi(matrah, yil):
    """Yil basindan itibaren toplam matrah uzerinden toplam vergi."""
    if yil not in TARIFE:
        raise NetMaasHatasi(
            "%d yili gelir vergisi tarifesi tanimli degil -- TARIFE'ye eklenmeli." % yil)
    m, top, alt = D(str(matrah)), D(0), D(0)
    for ust, oran in TARIFE[yil]:
        ust = D(str(ust)) if ust is not None else None
        dilim = (m - alt) if (ust is None or m < ust) else (ust - alt)
        if dilim <= 0:
            break
        top += dilim * D(str(oran))
        if ust is None or m < ust:
            break
        alt = ust
    return top


def _kesintiler(brut, yil, ay, gun=30, sgdp=False):
    """(brut, sgk, issizlik, gv_matrahi) -- tavan kirpmasi dahil."""
    brut = D(str(brut))
    tavan = sgk_tavan(yil, ay) * D(gun) / D(30)
    pek = min(brut, tavan)
    if sgdp:                       # emekli, sosyal guvenlik destek primi %7,5
        sgk, issizlik = _k(pek * D("0.075")), D("0.00")
    else:
        sgk, issizlik = _k(pek * D("0.14")), _k(pek * D("0.01"))
    return brut, sgk, issizlik, brut - sgk - issizlik


def _asgari_istisna(yil, ay, kum_asgari):
    """O ay asgari ucret uzerinden hesaplanmasi gereken GV ve damga.

    319 s. Teblig m.6/1 son cumle: istisnayla saglanan menfaat, asgari ucretin
    ilgili ayda hesaplanan vergisini asamaz. Asgari ucretlinin kendi kumulatif
    matrahi da yil icinde dilim atladigi icin (2026'da Temmuz'da) istisna
    tutari yil boyunca sabit DEGILDIR.
    """
    ba = brut_asgari(yil, ay)
    _, _, _, m = _kesintiler(ba, yil, ay)
    gv = _k(_tarife_vergisi(kum_asgari + m, yil) - _tarife_vergisi(kum_asgari, yil))
    return gv, m, _k(ba * DAMGA_ORANI)


def aylik_net(brut, yil, ay, kumulatif_matrah=0, kumulatif_asgari=None,
              gun=30, sgdp=False, istisna_var=True):
    """Tek bir ayin bordrosu. dict doner.

    brut              : o ayin brut ucreti (SGK dokumundeki PEK bunu verir)
    kumulatif_matrah  : ayni isverende yil basindan bu aya kadar biriken matrah
    kumulatif_asgari  : asgari ucretlinin ayni tarihteki kumulatif matrahi.
                        None ise (ay-1) tam ay varsayilir -- normal hal.
    istisna_var       : False ise asgari ucret istisnasi uygulanmaz. Birden
                        fazla isverenden ucret alan kisi icin istisna SADECE
                        en yuksek ucrete uygulanir (GVK 23/1-18 son cumle),
                        digerlerinde bu False verilmeli.
    """
    brut, sgk, issizlik, matrah = _kesintiler(brut, yil, ay, gun, sgdp)

    if kumulatif_asgari is None:
        kumulatif_asgari = D(0)
        for a in range(1, ay):
            _, m, _ = _asgari_istisna(yil, a, kumulatif_asgari)
            kumulatif_asgari += m

    kum = D(str(kumulatif_matrah))
    gv = _k(_tarife_vergisi(kum + matrah, yil) - _tarife_vergisi(kum, yil))
    damga = _k(brut * DAMGA_ORANI)

    if istisna_var:
        ist_gv, _, ist_damga = _asgari_istisna(yil, ay, kumulatif_asgari)
        # Istisna vergiyi sifirin altina indiremez (iade yok).
        uyg_gv, uyg_damga = min(gv, ist_gv), min(damga, ist_damga)
    else:
        uyg_gv = uyg_damga = D("0.00")

    net = brut - sgk - issizlik - (gv - uyg_gv) - (damga - uyg_damga)
    return {
        "yil": yil, "ay": ay, "brut": brut, "sgk": sgk, "issizlik": issizlik,
        "matrah": matrah, "kumulatif": kum + matrah,
        "gelir_vergisi": gv, "gv_istisnasi": uyg_gv, "odenecek_gv": gv - uyg_gv,
        "damga": damga, "damga_istisnasi": uyg_damga,
        "odenecek_damga": damga - uyg_damga, "net": net,
    }


def gv_matrahi(brut, yil, ay, gun=30, sgdp=False):
    """O ayin gelir vergisi matrahi (brut - SGK - issizlik).

    Kumulatif matrahi disaridan tasimak icin var: hesap.py, SGK dokumundeki
    her ayin PEK'inden bu fonksiyonla matrah cikarip topluyor. aylik_net()'i
    cagirmak da ayni sonucu verirdi ama o, tarifesi tanimli olmayan yilda
    gereksiz yere patliyor -- matrah icin tarife gerekmiyor.
    """
    return _kesintiler(brut, yil, ay, gun, sgdp)[3]


def yil_bordrosu(brut_aylik, yil, aylar=None, **kw):
    """Bir yilin aylarini sirayla hesaplar, kumulatifi kendisi tasir."""
    aylar = list(range(1, 13)) if aylar is None else list(aylar)
    kum, kum_asg, cikti = D(str(kw.pop("kumulatif_matrah", 0))), D(0), []
    for a in range(1, min(aylar) if aylar else 1):
        _, m, _ = _asgari_istisna(yil, a, kum_asg)
        kum_asg += m
    for ay in aylar:
        s = aylik_net(brut_aylik, yil, ay, kumulatif_matrah=kum,
                      kumulatif_asgari=kum_asg, **kw)
        cikti.append(s)
        kum = s["kumulatif"]
        _, m, _ = _asgari_istisna(yil, ay, kum_asg)
        kum_asg += m
    return cikti


def ceyrek(net):
    """Net ucretin 1/4'u -- IIK 83. ASAGI kirpilir (yasal ust sinir asilmasin).

    hesap.py'deki 'ceyrek' mantiginin aynisi: 28.075,50 -> 7.018,87
    (matematiksel yuvarlama 7.018,88 verirdi ve daireyle tutmazdi).
    """
    return (D(str(net)) / D(4)).quantize(D("0.01"), rounding=ROUND_DOWN)
