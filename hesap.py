# -*- coding: utf-8 -*-
"""
Maas haczi muzekkeresine cevap vermeyen isverenin (3. sahis) sorumlulugunu
hesaplar. IIK 355-356.

Mantik: muzekkere tebligden itibaren, borclunun o isyerinde SGK'da gorunen
her ayi icin net asgari ucretin 1/4'u kadar kesinti yapilmasi gerekirdi.
Yapilmadigi icin isveren bu toplamdan sorumlu; ancak dosya borcunu asamaz.

Bu dosya arayuzden bagimsizdir, tek basina test edilebilir.
"""

import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date

import xlrd

import net_maas


def _uygulama_klasoru():
    """ayarlar.json'un aranacagi klasor.

    PyInstaller ile .exe yapildiginda __file__ gecici bir klasoru gosterir;
    orada kullanicinin duzenledigi ayarlar.json bulunmaz. Bu yuzden .exe
    halinde exe'nin kendi klasorune bakilir.
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))

AYLAR = ["", "Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran",
         "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"]
AYLAR_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
            "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


# --------------------------------------------------------------------------
# Bicimlendirme
# --------------------------------------------------------------------------

def tl(x):
    """1234.5 -> '1.234,50'"""
    return f"{x:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def tarih_str(d):
    return d.strftime("%d.%m.%Y")


# --- Turkce buyuk/kucuk harf --------------------------------------------
# Python'un kendi upper()/lower()'i Turkce'yi bilmez: "icra".upper() -> "ICRA"
# (dogrusu "ICRA" degil "ICRA"... yani noktali I), "ISIK".lower() -> "isik"
# (dogrusu "isik" degil "isik"). Ozel isim ve daire adi belgeye yanlis
# gecmesin diye once i/I ciftleri elle degistiriliyor.

def buyuk_harf(metin):
    """'3. icra dairesi' -> '3. ICRA DAIRESI' (Turkce dogru: I ve I ayrimi)"""
    return (metin or "").replace("i", "İ").replace("ı", "I").upper()


def kucuk_harf(metin):
    """'YILMAZ' -> 'yilmaz' (Turkce dogru)"""
    return (metin or "").replace("I", "ı").replace("İ", "i").lower()


def ad_bicimle(ad):
    """'ahmet yilmaz' -> 'Ahmet YILMAZ'

    Kural (02.09.2026'da Ertugrul soyledi): adin ilk harfi buyuk gerisi
    kucuk, SOYAD tamamen buyuk. Soyad = son bosluktan sonraki kelime.
    Tek kelimeyse soyad sayilir (SGK dokumunde ad-soyad hep birlikte gelir,
    tek kelime kalmasi istisna; buyuk yazmak belgede her hâlükârda dogru).
    """
    parca = (ad or "").split()
    if not parca:
        return ""
    if len(parca) == 1:
        return buyuk_harf(parca[0])
    adlar = [buyuk_harf(p[:1]) + kucuk_harf(p[1:]) for p in parca[:-1]]
    return " ".join(adlar) + " " + buyuk_harf(parca[-1])


_SADECE_SAYI = re.compile(r"^(\d+)\.?$")


def daire_bicimle(metin):
    """'3' -> '3. ICRA DAIRESI';  yazi varsa oldugu gibi BUYUK harfe cevirir."""
    m = _SADECE_SAYI.match((metin or "").strip())
    if m:
        return f"{m.group(1)}. İCRA DAİRESİ"
    return buyuk_harf((metin or "").strip())


def borc_girildi(s):
    """Dosya borcu alani dolduruldu mu?  (para_coz bos alani 0.0 dondurur)"""
    return bool(s.dosya_borcu and s.dosya_borcu > 0)


# --- Turkce ek uyumu (ozel isimlere kesme isaretiyle ek getirmek icin) ------

_KALIN_DUZ, _KALIN_YUV = "aı", "ou"
_INCE_DUZ, _INCE_YUV = "ei", "öü"
_UNLULER = _KALIN_DUZ + _KALIN_YUV + _INCE_DUZ + _INCE_YUV


def _son_unlu(kelime):
    for h in reversed(kelime):
        if h in _UNLULER:
            return h
    return None


def _son_kelime(ad):
    """'ÖRNEK GIDA LTD. ŞTİ.' -> 'şti'  (nokta ve bosluklar atilir)"""
    parca = (ad or "").strip().strip(".").split()
    if not parca:
        return ""
    return parca[-1].strip(".").replace("I", "ı").replace("İ", "i").lower()


# Kisaltmalar sesletildikleri gibi ek alir: "A.Ş." -> "anonim sirketi'nin"
_KISALTMA = {"a.ş": ("nin", "ye"), "aş": ("nin", "ye"),
             "ltd": ("nin", "ye"), "şti": ("nin", "ye")}


def ek_ilgi(ad):
    """Ilgi (tamlayan) eki: ALTUNAY -> ALTUNAY'ın, ŞTİ. -> ŞTİ.'nin"""
    k = _son_kelime(ad)
    if k in _KISALTMA:
        return f"{ad}'{_KISALTMA[k][0]}"
    u = _son_unlu(k)
    ek = {None: "in"}.get(u) or (
        "ın" if u in _KALIN_DUZ else "un" if u in _KALIN_YUV
        else "in" if u in _INCE_DUZ else "ün")
    if k and k[-1] in _UNLULER:
        ek = "n" + ek
    return f"{ad}'{ek}"


def ek_yonelme(ad):
    """Yonelme (-e) eki: ŞTİ. -> ŞTİ.'ye, ALTUNAY -> ALTUNAY'a"""
    k = _son_kelime(ad)
    if k in _KISALTMA:
        return f"{ad}'{_KISALTMA[k][1]}"
    u = _son_unlu(k)
    # u None olabilir: son kelimede hic unlu yoksa (rakam, "MKS" gibi kisaltma)
    # ya da ad bosken. Eskiden burada "None in str" denip TypeError atiyordu ve
    # Word ciktisi COKUYORDU -- isveren unvani "GRUP 7" yazmak yetiyordu.
    # ek_ilgi() ayni durumu zaten ele almis (None -> "in"); buradaki karsiligi
    # ince/duz "e". 09.09.2026'da JS portu yapilirken bulundu.
    ek = "a" if (u is not None and u in _KALIN_DUZ + _KALIN_YUV) else "e"
    if k and k[-1] in _UNLULER:
        ek = "y" + ek
    return f"{ad}'{ek}"


def tarih_coz(metin):
    """'25.11.2025', '25/11/2025', '2025-11-25' kabul eder."""
    metin = (metin or "").strip()
    for kalip in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%y"):
        try:
            from datetime import datetime
            return datetime.strptime(metin, kalip).date()
        except ValueError:
            continue
    raise ValueError(f"Tarih anlasilamadi: {metin!r}  (ornek: 25.11.2025)")


def para_coz(metin):
    """'33.121,92' veya '33121.92' -> 33121.92"""
    metin = (metin or "").strip().replace(" ", "").replace("TL", "")
    if not metin:
        return 0.0
    if "," in metin:                      # Turkce yazim
        metin = metin.replace(".", "").replace(",", ".")
    return float(metin)


# --------------------------------------------------------------------------
# Ayarlar (asgari ucret tablosu)
# --------------------------------------------------------------------------

@dataclass
class Ayarlar:
    ay_gun: int = 30
    oran: float = 0.25
    donemler: list = field(default_factory=list)   # [(yil, ay, net, ceyrek), ...]

    @staticmethod
    def yukle(yol=None):
        yol = yol or os.path.join(_uygulama_klasoru(), "ayarlar.json")
        with open(yol, "r", encoding="utf-8") as f:
            veri = json.load(f)
        ay_gun = int(veri.get("ay_gun", 30))
        oran = float(veri.get("oran", 0.25))
        donemler = []
        for d in veri["donemler"]:
            y, a = d["baslangic"].split("-")
            net = float(d["net"])
            ceyrek = float(d["ceyrek"]) if "ceyrek" in d else round(net * oran, 2)
            brut = float(d["brut"]) if "brut" in d else None
            donemler.append((int(y), int(a), net, ceyrek, brut))
        donemler.sort()
        return Ayarlar(ay_gun=ay_gun, oran=oran, donemler=donemler)

    def donem_bul(self, yil, ay):
        """O ay icin gecerli (net, ceyrek, brut) dondurur. brut None olabilir."""
        bulunan = None
        for y, a, net, ceyrek, brut in self.donemler:
            if (y, a) <= (yil, ay):
                bulunan = (net, ceyrek, brut)
            else:
                break
        if bulunan is None:
            raise ValueError(
                f"{ay}/{yil} icin asgari ucret tanimli degil. "
                f"ayarlar.json dosyasina bu donemi ekle."
            )
        return bulunan

    def son_donem(self):
        """Tanimli en yeni donemin (yil, ay) bilgisi. donemler sirali."""
        y, a = self.donemler[-1][0], self.donemler[-1][1]
        return y, a


# --------------------------------------------------------------------------
# SGK hizmet dokumu okuma
# --------------------------------------------------------------------------

@dataclass
class Kayit:
    kol: str          # '4a' / '4b'
    isyeri: str
    yil: int
    ay: int
    gun: int
    giris: str
    cikis: str
    eksik_neden: str
    ad: str
    pek: float


BASLIKLAR = {
    "kol": "Sgrt. Kolu",
    "ad": "Adı Soyadı",
    "isyeri": "İşyeri",
    "unite": "Ünite",
    "donem": "Dönem",
    "giris": "Giriş",
    "gun": "Gün",
    "pek": "PEK",
    "cikis": "Çıkış",
    "eksik": "Eksik Gün Nedeni",
}


def _sutunlari_bul(sh):
    """Baslik satirini bulup sutun indekslerini cikarir."""
    for r in range(min(sh.nrows, 60)):
        satir = {}
        for c in range(sh.ncols):
            v = str(sh.cell_value(r, c)).strip()
            if not v:
                continue
            for anahtar, metin in BASLIKLAR.items():
                if anahtar not in satir and v.startswith(metin):
                    satir[anahtar] = c
        if "kol" in satir and "donem" in satir and "gun" in satir:
            return satir
    raise ValueError(
        "SGK dokumunun baslik satiri bulunamadi. "
        "Dosya gercekten 'SGK Uzun Vade Hizmet Dokumu' mu?"
    )


def _sayi(v):
    v = str(v).strip()
    if not v:
        return 0
    try:
        return int(float(v))
    except ValueError:
        return 0


def dokum_oku(yol):
    """
    .xls dosyasini okur, (kayitlar, kisi_adi, uyarilar) dondurur.
    Sessiz atlama yok: anlasilmayan her satir uyari listesine yazilir.
    """
    kitap = xlrd.open_workbook(yol)
    sh = kitap.sheet_by_index(0)
    sut = _sutunlari_bul(sh)

    kayitlar, uyarilar = [], []
    ad = ""
    atlanan_toplam = 0

    for r in range(sh.nrows):
        kol = str(sh.cell_value(r, sut["kol"])).strip()
        if not kol:
            continue
        if kol.lower().startswith("toplam"):        # yil ozeti satiri
            atlanan_toplam += 1
            continue
        if kol not in ("4a", "4b", "4c"):           # baslik tekrarlari vb.
            continue

        donem = str(sh.cell_value(r, sut["donem"])).strip()
        m = re.match(r"^(\d{4})\s*/\s*(\d{1,2})$", donem)
        if not m:
            uyarilar.append(f"Satir {r + 1}: donem okunamadi ({donem!r}), atlandi.")
            continue

        isyeri = str(sh.cell_value(r, sut["isyeri"])).strip() if "isyeri" in sut else ""
        if not isyeri and "unite" in sut:
            isyeri = str(sh.cell_value(r, sut["unite"])).strip()

        kisi = str(sh.cell_value(r, sut["ad"])).strip() if "ad" in sut else ""
        if kisi and not ad:
            ad = kisi

        pek = 0.0
        if "pek" in sut:
            try:
                pek = float(str(sh.cell_value(r, sut["pek"])).strip() or 0)
            except ValueError:
                pek = 0.0

        kayitlar.append(Kayit(
            kol=kol,
            isyeri=isyeri,
            yil=int(m.group(1)),
            ay=int(m.group(2)),
            gun=_sayi(sh.cell_value(r, sut["gun"])),
            giris=str(sh.cell_value(r, sut["giris"])).strip() if "giris" in sut else "",
            cikis=str(sh.cell_value(r, sut["cikis"])).strip() if "cikis" in sut else "",
            eksik_neden=str(sh.cell_value(r, sut["eksik"])).strip() if "eksik" in sut else "",
            ad=kisi,
            pek=pek,
        ))

    if not kayitlar:
        raise ValueError("Dosyada hic hizmet kaydi bulunamadi.")

    # Dokumde 4a disi kol varsa dosya okunur okunmaz soyle -- hesap asamasina
    # kadar bekleme. (kol_uyarisi asagida tanimli, cagri aninda cozuluyor.)
    ku = kol_uyarisi(kayitlar)
    if ku:
        uyarilar.insert(0, ku)
    return kayitlar, ad, uyarilar


# --------------------------------------------------------------------------
# Isveren secimi
# --------------------------------------------------------------------------

@dataclass
class IsverenOzet:
    isyeri: str
    ilk: tuple          # (yil, ay)
    son: tuple
    ay_sayisi: int
    teblig_ayinda_var: bool

    def etiket(self):
        i, s = self.ilk, self.son
        yildiz = " *" if self.teblig_ayinda_var else ""
        return (f"{self.isyeri}  ({i[1]:02d}/{i[0]} - {s[1]:02d}/{s[0]}, "
                f"{self.ay_sayisi} ay){yildiz}")


# --------------------------------------------------------------------------
# Sigortalilik kolu -- PEK sutunu SADECE 4a'da brut ucreti verir
# --------------------------------------------------------------------------
#
# Bu program isverenin kesmesi gereken 1/4'u SGK dokumundeki PEK ("prime esas
# kazanc") sutunundan hesapliyor. O sutun 4a (isci) icin brut ucretin kendisi;
# diger kollarda DEGIL:
#
#   4c (memur/kamu) -- 5510 m.80/3'e gore PEK'e sadece gosterge ayligi, ek
#       gosterge ayligi, taban aylik, kidem ayligi, makam/temsil/gorev
#       tazminati ve 657 s.K. 152'nin ASIL tazminatlari giriyor. SGK'nin kendi
#       duyurusunun cumlesi: "Bu unsurlar disinda kalan ve kamu personeline her
#       ne ad altinda odeme yapilirsa yapilsin diger aylik odeme unsurlari
#       prime esas kazanc tutarina dahil edilmemektedir." Yani ek odeme (375
#       s. KHK ek 9), aile yardimi, yan odeme, sosyal denge tazminati, yabanci
#       dil, fazla mesai PEK'e HIC girmiyor -- memur maasinin buyuk kismi bu
#       kalemlerden geliyor. Ustelik kalan tutar asgari ucretin altina duserse
#       5510 m.82 geregi ALT SINIR (brut asgari ucret) bildiriliyor.
#       SONUC: memurun PEK'i cogu zaman TAM ASGARI UCRETE yapisik cikar ve
#       gercek maasiyla ilgisi olmaz. 03.09.2026'da olculdu: 65.000 TL alan
#       bir memurun dokumunde 2025 boyunca PEK = 26.005,50 (tam brut asgari
#       ucret), 2026'da 33.030,00. Program bu kaydi 4a sanip hesaplasaydi
#       1/4'u 5.526,17 derdi -- hem de "SGK teyitli" diye YESIL boyayarak.
#
#   4b (Bagkur) -- PEK sigortalinin kendi beyani, genelde taban.
#
# Bu yuzden hesap 4a ile sinirli. Sinir SESSIZ olmamali: dokumde 4a disi kayit
# varsa kullanici sebebini gormeli, yoksa "isveren cikmiyor" diye takiliyor.
KOL_ADI = {
    "4a": "4a (SSK - isci)",
    "4b": "4b (Bagkur - esnaf/tarim)",
    "4c": "4c (Emekli Sandigi - memur/kamu)",
}


def kol_ozeti(kayitlar):
    """{kol: kayit sayisi} -- dokumde hangi sigortalilik kollari var."""
    ozet = {}
    for k in kayitlar:
        ozet[k.kol] = ozet.get(k.kol, 0) + 1
    return ozet


def kol_uyarisi(kayitlar):
    """Dokumde 4a disi kol varsa aciklayici uyari, yoksa ''.

    Iki ayri durum var, ikisi de soylenmeli:
      - Hic 4a yok  -> program bu dosyayla hesap YAPAMAZ (kirmizi durum).
      - 4a var ama yaninda 4c/4b de var -> hesap yapilir, ama sadece 4a
        aylari sayilir; memur/Bagkur donemleri disarida kalir.
    """
    ozet = kol_ozeti(kayitlar)
    disi = [k for k in ("4c", "4b") if ozet.get(k)]
    if not disi:
        return ""

    liste = ", ".join(f"{KOL_ADI[k]}: {ozet[k]} kayit" for k in disi)
    if ozet.get("4a"):
        bas = (f"!!! DOKUMDE 4a DISI KAYIT DA VAR ({liste}). Hesap yalniz 4a "
               f"(isci) aylarini kapsiyor, bu donemler disarida kaldi.")
    else:
        bas = (f"!!! DOKUMDE HIC 4a (isci) KAYDI YOK -- sadece {liste}. "
               f"Bu program bu dosyayla hesap YAPAMAZ.")

    if ozet.get("4c"):
        bas += (
            " Sebep: memurun PEK sutunu gercek maasini VERMEZ. Ek odeme, aile "
            "yardimi, yan odeme, sosyal denge tazminati prime esas kazanca "
            "girmiyor (5510 m.80/3); kalan tutar asgari ucretin altina duserse "
            "asgari ucret bildiriliyor (5510 m.82). Bu yuzden memurun PEK'i "
            "cogu zaman tam asgari ucrete yapisik cikar. Memur/kamu gorevlisi "
            "dosyasinda maas bilgisi KURUMDAN (maas bordrosu / saymanlik) "
            "istenmeli, bu dokumden cikarilamaz."
        )
    return bas


def isverenleri_listele(kayitlar, teblig=None, karar=None):
    """Dokumdeki 4a isverenleri, en uygunu basta.

    teblig/karar VERILIRSE liste o araliga daraltilir. VERILMEZSE dokumdeki
    butun isverenler listelenir.

    Neden None kabul ediyor: arayuz dosyayi, tarihler girilmeden once okuyor.
    Eskiden bu durumda liste bos kaliyor ve program HICBIR SEY SOYLEMIYORDU;
    kullanici "isveren cikmiyor" diye takiliyordu. Artik dosya yuklenir
    yuklenmez butun isverenler gorunuyor, tarih girilince daraliyor.
    """
    t_ay = (teblig.year, teblig.month) if teblig else None
    k_ay = (karar.year, karar.month) if karar else None
    gruplar = {}
    for k in kayitlar:
        if k.kol != "4a" or not k.isyeri:
            continue
        gruplar.setdefault(k.isyeri, []).append((k.yil, k.ay))

    ozetler = []
    for isyeri, aylar in gruplar.items():
        arada = [a for a in aylar
                 if (t_ay is None or a >= t_ay) and (k_ay is None or a <= k_ay)]
        if not arada:
            continue
        ozetler.append(IsverenOzet(
            isyeri=isyeri,
            ilk=min(aylar),
            son=max(aylar),
            ay_sayisi=len(set(arada)),
            teblig_ayinda_var=(t_ay is not None and t_ay in aylar),
        ))
    ozetler.sort(key=lambda o: (not o.teblig_ayinda_var, -o.ay_sayisi, o.isyeri))
    return ozetler


# --------------------------------------------------------------------------
# Hesap
# --------------------------------------------------------------------------

@dataclass
class Kalem:
    yil: int
    ay: int
    gun: int
    ceyrek: float
    net: float
    tutar: float
    aciklama: str = ""
    pek: float = 0.0          # SGK'ya bildirilen kazanc (brut), o ayki hali
    pek_30: float = 0.0       # ayni kazancin 30 gune cevrilmis hali
    asgari_ustu: bool = False # SGK kazanci brut asgari ucretin ustunde mi
    teyit: str = ""           # teyitli | asgari-ustu | asgari-alti | veri-yok
    net_kaynak: str = "asgari"  # asgari | pek | bildirilen
    kumulatif: float = 0.0    # net PEK'ten hesaplandiysa o ayki kumulatif matrah

    @property
    def ay_adi(self):
        return AYLAR_TR[self.ay]


@dataclass
class Sonuc:
    kisi: str
    isyeri: str
    teblig: date
    karar: date
    kalemler: list
    toplam: float
    dosya_borcu: float
    borclandirma: float
    calisma_bitisi: str
    halen_calisiyor: bool
    uyarilar: list
    pek_ay_sayisi: int = 0         # kac ayin neti SGK kazancindan hesaplandi
    veri_yok_ay: int = 0           # kac ayda kazanc bilgisi hic yoktu
    kusur: str = "cevap-yok"       # cevap-yok | kesinti-yok (tutanak dili)


def _ay_ilerle(ya):
    y, a = ya
    return (y + 1, 1) if a == 12 else (y, a + 1)


# --------------------------------------------------------------------------
# PEK'ten net ucret icin yardimcilar (net_maas.py'yi besleyen kisim)
# --------------------------------------------------------------------------

def _isveren_aylik_pek(kayitlar, isyeri):
    """{(yil, ay): (toplam_pek, toplam_gun)} -- sadece bu isverenin 4a satirlari."""
    d = {}
    for k in kayitlar:
        if k.kol != "4a" or k.isyeri != isyeri:
            continue
        p, g = d.get((k.yil, k.ay), (0.0, 0))
        d[(k.yil, k.ay)] = (p + k.pek, g + k.gun)
    return d


def _kumulatif_tablosu(aylik_pek, ay_gun=30):
    """({(yil, ay): o aydan ONCE birikmis GV matrahi}, eksik_veri_aylari)

    Gelir vergisi artan oranli ve yil basindan biriken matraha gore
    hesaplaniyor; yani ayni brut maas, yilin ilerleyen aylarinda daha DUSUK
    net veriyor. Bu tablo o birikimi tasiyor.

    Kumulatif her Ocak'ta sifirlanir. Isveren degisince de sifirlanir (genel
    kural: yeni isveren onceki kumulatifi devralmak zorunda degil), o yuzden
    tablo tek bir isverenin kayitlariyla kuruluyor.

    Tarifesi tanimli olmayan bir yil burada patlamaz -- matrah tarifeden
    bagimsiz. Patlama, gercekten vergi hesaplanacagi anda olur.
    """
    tablo, eksik, kum, onceki_yil = {}, [], 0.0, None
    for (y, a) in sorted(aylik_pek):
        if y != onceki_yil:
            kum, onceki_yil = 0.0, y
        tablo[(y, a)] = kum
        pek, gun = aylik_pek[(y, a)]
        if pek > 0 and gun > 0:
            kum += float(net_maas.gv_matrahi(pek, y, a, gun=min(gun, ay_gun)))
        else:
            eksik.append((y, a))          # sessiz gecme: kumulatif eksik kalir
    return tablo, eksik


def _en_yuksek_isveren(kayitlar):
    """{(yil, ay): en_yuksek_PEK} -- SADECE birden fazla isveren olan aylar.

    NEDEN: GVK 23/1-18 son cumlesi, ayni anda birden fazla isverenden ucret
    alanda asgari ucret istisnasinin YALNIZCA en yuksek ucrete uygulanacagini
    soyluyor. Digerinde istisna yok, yani net daha dusuk cikar.

    Isyeri adi degil TUTAR donuyor; cagiran taraf kendi PEK'ini bununla
    kiyaslasin. Sebep: iki isveren esit odemisse "en yuksek" belirsiz kalir
    (secim vergi mukellefinin) -- esitlikte istisna VERILIR, boylece program
    kendi kafasina gore bir isyerini cezalandirmis olmaz.
    """
    ayl = {}
    for k in kayitlar:
        if k.kol != "4a" or not k.isyeri:
            continue
        d = ayl.setdefault((k.yil, k.ay), {})
        d[k.isyeri] = d.get(k.isyeri, 0.0) + k.pek
    return {ay: max(d.values()) for ay, d in ayl.items() if len(d) > 1}


def hesapla(kayitlar, isyeri, teblig, karar, dosya_borcu, ayarlar, kisi="",
            kusur="cevap-yok"):
    """Isverenin sorumlu oldugu tutari ay ay hesaplar.

    MAAS VARSAYIMI YOK. Her ayin ucreti SGK hizmet dokumunun kendisinden,
    "PEK" (prime esas kazanc) sutunundan okunur. Programin disaridan maas
    sormasi diye bir sey yoktur -- borclunun her ay ne kazandigi zaten
    dokumde yazilidir.

    Ayin neti su yollardan biriyle bulunur (Kalem.net_kaynak'ta yazili):
      "asgari" : SGK kazanci tam asgari ucret. O donemin YAYIMLANMIS net
                 asgari ucreti ve ayarlar.json'daki 1/4 kullanilir. (Kanun
                 formulu de kurusu kurusuna ayni neti veriyor -- 60/60 ayda
                 olculdu, test_net_maas.py. Yayimlanmis rakam tercih ediliyor
                 ki dairenin 1/4 yuvarlamasi korunsun.)
      "pek"    : SGK kazanci asgari ucretten FARKLI (ustu ya da alti). O ayin
                 neti kanunun formuluyle hesaplanir (net_maas.py, kumulatif
                 matrah ay ay tasinir) ve 1/4 ondan alinir. Vergi artan oranli
                 oldugu icin ayni brutte bile her ay farkli borc cikar.
      "veri-yok": dokumde o ayin kazanci hic yok. Hesap yapilabilsin diye
                 asgari ucret kullanilir ama BAGIRARAK uyarilir -- bu bir
                 varsayim degil, doldurulmasi gereken bir BOSLUK.

    kusur: tutanak dilini secer. "cevap-yok" = muzekkereye cevap vermedi;
           "kesinti-yok" = cevap verdi ama kesinti yapmadi/gondermedi.
           Ikisi de IIK 356 kapsaminda, hesap ayni.
    """
    if karar < teblig:
        raise ValueError("Karar tarihi teblig tarihinden once olamaz.")

    AY_GUN = ayarlar.ay_gun
    uyarilar = []

    # Ayni ay/isyeri icin birden fazla satir olabilir (farkli giris), topla.
    gunler = {}
    pekler = {}          # ayni ayin butun satirlarindaki PEK TOPLAMI
    son_kayit = {}
    for k in kayitlar:
        if k.kol != "4a" or k.isyeri != isyeri:
            continue
        anahtar = (k.yil, k.ay)
        onceki = gunler.get(anahtar, 0)
        gunler[anahtar] = onceki + k.gun
        # Gun toplaniyorsa PEK de toplanmali. Toplanmazsa (eski hal) ayin
        # sadece SON satirinin kazanci, TUM gunlere bolunuyordu ve ay yanlisla
        # "asgari ucret alti" gorunuyordu. Ornek: 1212871 / 06-2024, iki satir.
        pekler[anahtar] = pekler.get(anahtar, 0.0) + k.pek
        son_kayit[anahtar] = k
        if gunler[anahtar] > AY_GUN:
            uyarilar.append(
                f"{AYLAR_TR[k.ay]} {k.yil}: birden fazla satirdan toplam "
                f"{gunler[anahtar]} gun cikti, {AY_GUN} gune indirildi."
            )
            gunler[anahtar] = AY_GUN

    if not gunler:
        ek = kol_uyarisi(kayitlar)
        raise ValueError(f"{isyeri} numarali isyerine ait 4a kaydi bulunamadi."
                         + (" " + ek if ek else ""))

    # PEK'ten net hesabi icin: kumulatif matrah tablosu ve coklu isveren aylari.
    # Kumulatif, hesaba giren aylardan ONCEKI aylari da kapsamali (yil basindan
    # beri birikiyor), o yuzden isverenin TUM kayitlarindan kuruluyor.
    kum_tablo, pek_eksik = _kumulatif_tablosu(
        _isveren_aylik_pek(kayitlar, isyeri), AY_GUN)
    coklu_ay = _en_yuksek_isveren(kayitlar)

    t_ay = (teblig.year, teblig.month)
    k_ay = (karar.year, karar.month)
    son_ay = max(a for a in gunler if a <= k_ay) if any(a <= k_ay for a in gunler) else None
    if son_ay is None or son_ay < t_ay:
        raise ValueError(
            f"Teblig tarihinden ({tarih_str(teblig)}) sonra bu isyerinde "
            f"hic SGK kaydi yok. Isveren sorumlu tutulamaz."
        )

    halen = (son_ay == k_ay)
    if halen:
        calisma_bitisi = f"halen calistigi ({tarih_str(karar)} itibariyle)"
    else:
        cik = son_kayit[son_ay].cikis
        if cik:
            calisma_bitisi = cik
        else:
            y, a = _ay_ilerle(son_ay)
            calisma_bitisi = f"01.{a:02d}.{y}"

    kalemler = []
    imlec = t_ay
    while imlec <= son_ay:
        yil, ay = imlec
        gun = gunler.get(imlec, 0)
        aciklama = ""

        if gun == 0:
            uyarilar.append(f"{AYLAR_TR[ay]} {yil}: bu ay SGK kaydi yok, hesaba katilmadi.")
            imlec = _ay_ilerle(imlec)
            continue

        if imlec == t_ay:
            kalan = AY_GUN - teblig.day
            if kalan <= 0:
                uyarilar.append(
                    f"{AYLAR_TR[ay]} {yil}: teblig ayin {teblig.day}'inde, "
                    f"ay sonuna gun kalmadi, bu ay hesaba katilmadi."
                )
                imlec = _ay_ilerle(imlec)
                continue
            # ILK AY KURALI (02.09.2026, adliyeden alindi, Ertugrul onayladi):
            #
            # (a) SGK dokumunde kac gun yazarsa yazsin, teblig ayinda
            #     TEBLIGDEN SONRAKI gunler sayilir. Teblig 25 Kasim ise
            #     Kasim'dan 5 gun. Tebligden ONCEKI calisma isvereni
            #     ilgilendirmiyor -- o gunlerde kesme yukumlulugu yoktu.
            #
            # (b) "Tebligden sonra kalan gun, o ay calistigi gunden buyukse
            #     o ay borclandirilmaz." Sebep: SGK dokumu o ay KAC GUN
            #     sigortali oldugunu soyler, HANGI GUNLER oldugunu soylemez.
            #     Adam o ay 3 gun calismis ve teblig 25'inde geldiyse, o 3 gun
            #     buyuk ihtimalle ayin BASINDA -- teblig geldiginde isyerinde
            #     degildi, isverenin kesecek maasi yoktu. Ortustugu
            #     kanitlanamadigi icin isveren lehine karar veriliyor.
            #
            # Ikisi birlikte: gun < kalan ise ay hic yazilmaz; degilse gun,
            # kalan'a esitlenir.
            if gun < kalan:
                uyarilar.append(
                    f"{AYLAR_TR[ay]} {yil} (teblig ayi): tebligden sonra kalan "
                    f"gun ({kalan}) SGK gununden ({gun}) FAZLA oldugu icin bu "
                    f"ay hesaba KATILMADI. Dokum bu {gun} gunun ayin neresine "
                    f"dustugunu soylemiyor; teblig oncesine dusmus olabilirler, "
                    f"o yuzden isveren lehine sayilmadi."
                )
                imlec = _ay_ilerle(imlec)
                continue
            aciklama = f"tebliğ {teblig.day}'inde, ayın kalanı"
            gun = kalan

        if imlec == k_ay and gun > karar.day:
            aciklama = f"karar tarihine ({karar.day}.) kadar"
            gun = karar.day

        asg_net, asg_ceyrek, brut = ayarlar.donem_bul(yil, ay)

        # --- SGK'ya bildirilen kazanc (PEK) ve "bu asgari ucret mi" teyidi ---
        ham = son_kayit[imlec]
        ay_pek = pekler.get(imlec, 0.0)
        sgk_gun = gunler.get(imlec, 0)
        pek_30 = (ay_pek / sgk_gun * AY_GUN) if sgk_gun else 0.0

        if not brut or pek_30 <= 0:
            teyit = "veri-yok"
        elif abs(pek_30 - brut) <= 1.0:
            teyit = "teyitli"
        elif pek_30 > brut:
            teyit = "asgari-ustu"
        else:
            teyit = "asgari-alti"
        ustu = (teyit == "asgari-ustu")

        # --- Bu ayin neti: HER ZAMAN SGK dokumundeki kazanctan -------------
        net_kaynak, kumulatif = "asgari", 0.0

        if teyit == "veri-yok":
            # Kazanc bilgisi yok. Bu bir varsayim degil, BOSLUK -- bagir.
            net, ceyrek = asg_net, asg_ceyrek
            net_kaynak = "veri-yok"
            uyarilar.append(
                f"!!! {AYLAR_TR[ay]} {yil}: dokumde bu ayin kazanci (PEK) YOK. "
                f"Hesap yapilabilsin diye asgari ucret kullanildi ({tl(asg_net)} "
                f"TL, 1/4 = {tl(asg_ceyrek)} TL) ama bu bir TAHMIN. Dokumu "
                f"kontrol et, gerekirse isverenden bordro iste."
            )

        elif teyit == "teyitli":
            # SGK kazanci tam asgari ucret. Yayimlanmis net asgari ucret ve
            # dairenin kullandigi 1/4 rakami kullaniliyor. Kanun formulu de
            # ayni neti veriyor (60/60 ayda olculdu); yayimlanmis rakam
            # tercih ediliyor ki dairenin yuvarlamasi korunsun.
            net, ceyrek = asg_net, asg_ceyrek

        else:
            # SGK kazanci asgari ucretten FARKLI (ustu ya da alti). O ayin neti
            # kanunun formuluyle hesaplanir (GVK 103 + 23/1-18 + 319 s. Teblig).
            # Vergi kumulatif matraha gore artan oranli oldugu icin ayni brut
            # her ay farkli net verir -> her ay farkli 1/4 -> farkli borc.
            kumulatif = kum_tablo.get(imlec, 0.0)
            istisna_var = (imlec not in coklu_ay
                           or ay_pek >= coklu_ay[imlec] - 0.01)
            try:
                bordro = net_maas.aylik_net(
                    pek_30, yil, ay, kumulatif_matrah=kumulatif,
                    gun=AY_GUN, istisna_var=istisna_var)
                net = float(bordro["net"])
                ceyrek = float(net_maas.ceyrek(net))
                net_kaynak = "pek"
                yon = "USTUNDE" if ustu else "ALTINDA"
                isaret = "+" if ustu else "-"
                uyarilar.append(
                    f"{AYLAR_TR[ay]} {yil}: SGK kazanci asgari ucretin {yon} "
                    f"({tl(pek_30)} TL brut / asgari {tl(brut)} TL, fark "
                    f"{isaret}{tl(abs(pek_30 - brut))}). Bu ayin neti KANUN "
                    f"FORMULUYLE hesaplandi: kumulatif matrah {tl(kumulatif)} "
                    f"TL, net {tl(net)} TL, 1/4 = {tl(ceyrek)} TL (asgari ucret "
                    f"alinsaydi {tl(asg_ceyrek)} TL olurdu)."
                )
                if not ustu:
                    uyarilar.append(
                        f"{AYLAR_TR[ay]} {yil}: kazanc asgari ucretin ALTINDA "
                        f"gorunuyor. Kismi sureli calisma olabilecegi gibi EKSIK "
                        f"BILDIRIM de olabilir — ikincisiyse gercek borc daha "
                        f"yuksektir. Dokumu ve varsa bordroyu kontrol et."
                    )
                if not istisna_var:
                    uyarilar.append(
                        f"{AYLAR_TR[ay]} {yil}: bu ay ayni anda birden fazla "
                        f"isveren var; asgari ucret gelir vergisi istisnasi "
                        f"GVK 23/1-18 geregi SADECE en yuksek ucrete uygulanir. "
                        f"Bu isyeri en yuksek olmadigi icin istisnasiz "
                        f"hesaplandi (net daha dusuk cikti)."
                    )
            except net_maas.NetMaasHatasi as e:
                net, ceyrek = asg_net, asg_ceyrek
                net_kaynak = "veri-yok"
                uyarilar.append(
                    f"!!! {AYLAR_TR[ay]} {yil}: SGK kazanci {tl(pek_30)} TL ama "
                    f"net ucret HESAPLANAMADI ({e}). Bu ay asgari ucretten "
                    f"hesaplandi, yani TUTAR YANLIS. net_maas.py'ye ilgili "
                    f"yilin tarifesini ekleyip tekrar calistir."
                )

        tutar = ceyrek if gun >= AY_GUN else round(ceyrek / AY_GUN * gun, 2)
        if not aciklama and gun < AY_GUN:
            neden = son_kayit[imlec].eksik_neden
            aciklama = (f"SGK'da eksik gün (neden kodu {neden})" if neden
                        else "SGK'da eksik gün")

        kalemler.append(Kalem(yil, ay, gun, ceyrek, net, tutar, aciklama,
                              pek=ay_pek, pek_30=pek_30, asgari_ustu=ustu,
                              teyit=teyit, net_kaynak=net_kaynak,
                              kumulatif=kumulatif))
        imlec = _ay_ilerle(imlec)

    if not kalemler:
        # "Hesaplanacak ay kalmadi." demek yetmiyor, kullanici NEDEN kalmadigini
        # goremiyordu. Toplanan uyarilar zaten sebebi yaziyor, onlari da ver.
        neden = "\n  - ".join(uyarilar) if uyarilar else "sebep kaydedilmedi"
        raise ValueError(
            "Hesaplanacak ay kalmadi — teblig ile karar tarihi arasindaki her "
            "ay elendi.\n  - " + neden)

    # Ozet: maas nereden geldi? (Varsayim yok -- hepsi SGK dokumunden.)
    n = len(kalemler)
    pek_ay = sum(1 for k in kalemler if k.net_kaynak == "pek")
    asg_ay = sum(1 for k in kalemler if k.net_kaynak == "asgari")
    yok_ay = sum(1 for k in kalemler if k.net_kaynak == "veri-yok")

    if yok_ay:
        uyarilar.insert(0,
            f"!!! {n} ayin {yok_ay}'inde kazanc bilgisi YOK, o aylar asgari "
            f"ucretle dolduruldu (tahmin). Dokumu kontrol et — hesap eksik "
            f"olabilir.")
    if pek_ay:
        fark = round(sum(
            k.tutar - round(
                (ayarlar.donem_bul(k.yil, k.ay)[1] if k.gun >= AY_GUN
                 else ayarlar.donem_bul(k.yil, k.ay)[1] / AY_GUN * k.gun), 2)
            for k in kalemler if k.net_kaynak == "pek"), 2)
        uyarilar.insert(0,
            f"MAAS KAYNAGI: {n} ayin {pek_ay}'inde SGK'ya bildirilen kazanc "
            f"asgari ucretten farkli; o aylarin neti kanun formuluyle "
            f"(GVK 103 + 23/1-18 + 319 s. Teblig) ay ay hesaplandi. Kalan "
            f"{asg_ay} ayda SGK'da tam asgari ucret yaziyor. Hepsi asgari "
            f"ucretle hesaplansaydi toplam {tl(abs(fark))} TL "
            f"{'DUSUK' if fark > 0 else 'YUKSEK'} olurdu.")
        eksik_ilgili = sorted(a for a in pek_eksik
                              if any(a[0] == k.yil and a <= (k.yil, k.ay)
                                     for k in kalemler if k.net_kaynak == "pek"))
        if eksik_ilgili:
            liste = ", ".join(f"{AYLAR_TR[a]} {y}" for y, a in eksik_ilgili)
            uyarilar.insert(1,
                f"!!! DIKKAT: su aylarda PEK/gun bilgisi yok, kumulatif matraha "
                f"katilamadi ({liste}). Kumulatif oldugundan DUSUK kaldi, yani "
                f"vergi az, net YUKSEK, 1/4 de YUKSEK cikmis olabilir. "
                f"Dokumu elden kontrol et.")
    elif asg_ay == n:
        uyarilar.insert(0,
            f"MAAS KAYNAGI: {n} ayin {n}'inde SGK'ya bildirilen kazanc TAM "
            f"ASGARI UCRET. Rakam varsayim degil, dokumden okundu.")

    toplam = round(sum(k.tutar for k in kalemler), 2)
    if dosya_borcu and dosya_borcu > 0:
        borclandirma = min(toplam, dosya_borcu)
    else:
        borclandirma = toplam
        uyarilar.append("Dosya borcu girilmedi; borclandirma toplamin tamami alindi.")


    # Asgari ucret tablosu bayat mi?
    # donem_bul() tanimli araligin ONCESI icin hata veriyor ama SONRASI icin
    # sessizce en son donemi donduruyor. Tablo guncellenmezse hesap eski
    # (dusuk) rakamla yapilir ve kimse fark etmez. Sessiz basarisizlik olmasin.
    son_y, son_a = ayarlar.son_donem()
    bayat = sorted({(k.yil, k.ay) for k in kalemler if k.yil > son_y})
    if bayat:
        liste = ", ".join(f"{AYLAR_TR[a]} {y}" for y, a in bayat)
        uyarilar.insert(0,
            f"!!! ASGARI UCRET TABLOSU ESKI — TUTAR DUSUK CIKTI. "
            f"ayarlar.json'daki en yeni donem {son_a:02d}/{son_y}. Su aylar o "
            f"donemin otesinde ve {son_y} rakamiyla hesaplandi: {liste}. "
            f"Ilgili yilin net asgari ucretini ve 1/4'unu ayarlar.json'a ekle, "
            f"hesabi tekrar calistir.")
    elif karar.year > son_y:
        uyarilar.insert(0,
            f"UYARI: ayarlar.json'daki en yeni asgari ucret donemi "
            f"{son_a:02d}/{son_y}, bugun ise {karar.year}. Bu hesap "
            f"etkilenmedi ama tablo guncellenmeli.")

    return Sonuc(
        kisi=kisi, isyeri=isyeri, teblig=teblig, karar=karar,
        kalemler=kalemler, toplam=toplam, dosya_borcu=dosya_borcu,
        borclandirma=borclandirma, calisma_bitisi=calisma_bitisi,
        halen_calisiyor=halen, uyarilar=uyarilar,
        pek_ay_sayisi=pek_ay, veri_yok_ay=yok_ay, kusur=kusur,
    )


# --------------------------------------------------------------------------
# Tutanak metni
# --------------------------------------------------------------------------

def _gruplandir(kalemler):
    """Ust uste ayni (gun, tutar) olan aylari tek cumlede toplar."""
    gruplar = []
    for k in kalemler:
        if gruplar and gruplar[-1][0].gun == k.gun and gruplar[-1][0].tutar == k.tutar \
                and gruplar[-1][0].ceyrek == k.ceyrek \
                and gruplar[-1][0].net_kaynak == k.net_kaynak:
            gruplar[-1].append(k)
        else:
            gruplar.append([k])
    return gruplar


def _aylari_yaz(grup):
    adlar = [k.ay_adi for k in grup]
    if len(adlar) == 1:
        return f"{adlar[0]} ayindan".replace("ayindan", "ayından")
    if len(adlar) == 2:
        return f"{adlar[0]} ve {adlar[1]} aylarından"
    return f"{', '.join(adlar[:-1])} ve {adlar[-1]} aylarından"


def tutanak_metni(s):
    """Kagittaki paragrafin aynisini uretir."""
    p = []
    onceki_ceyrek = None
    for grup in _gruplandir(s.kalemler):
        k = grup[0]
        if k.ceyrek != onceki_ceyrek:
            if k.net_kaynak == "pek":
                # Bu ayin neti asgari ucret degil, SGK'ya bildirilen kazanctan
                # hesaplandi; cumle de bunu soylemeli. (Sayi dogruyken metnin
                # yanlis kalmasi bu dosyada bir kez yasandi, tekrarlanmasin.)
                p.append(f"SGK'ya bildirilen prime esas kazancına göre hesaplanan "
                         f"net ücreti olan {tl(k.net)} TL'nin 1/4 ü "
                         f"{tl(k.ceyrek)} TL'den")
            else:
                p.append(f"{k.yil} yılı asgari ücret tarifesi olan {tl(k.net)} TL'nin "
                         f"1/4 ü {tl(k.ceyrek)} TL'den")
            onceki_ceyrek = k.ceyrek
        aylar = _aylari_yaz(grup)
        if k.gun >= 30:
            p.append(f"{aylar} {tl(k.tutar)} TL")
        else:
            p.append(f"{aylar} {k.gun} günlük {tl(k.tutar)} TL")

    bitis = (f"halen çalıştığı" if s.halen_calisiyor
             else f"{s.calisma_bitisi} tarihine kadar çalıştığı")

    # IIK 356 iki ayri kusuru da kapsiyor: cevap vermemek VEYA kesip
    # gondermemek. Hesap ikisinde de ayni; degisen sadece cumle.
    if s.kusur == "kesinti-yok":
        kusur = "müzekkeresi gereğince maaştan kesinti yapmadığı"
    else:
        kusur = "müzekkeresine süresi içerisinde cevap vermediği"

    bas = (
        f"Borçlunun maaşının haczi için yazılan {tarih_str(s.teblig)} tebliğ tarihli "
        f"maaş haciz {kusur}, UYAP üzerinden "
        f"yapılan SGK sorgusunda borçlunun bu kurumda {bitis} anlaşılmakla "
        f"bugün itibariyle 3. Şahsın "
    )
    orta = " ".join(p)
    # Dosya borcu girilmediyse "0,00 TL oldugu gorulmekle" YAZILMAZ -- olmayan
    # bir rakami belgeye "tespit edilmis" gibi yazmak yanlis olur. O durumda
    # cumle dogrudan cikan tutari soyluyor.
    if borc_girildi(s):
        borc_cumlesi = (f", dosya borcunun bugün tarihi itibari ile "
                        f"{tl(s.dosya_borcu)} TL olduğu görülmekle")
    else:
        borc_cumlesi = " görülmekle"
    son = (
        f" TOPLAMDA {tl(s.toplam)} TL kesinti yapmadığı{borc_cumlesi} "
        f"bugün tarihi itibariyle "
        f"faiz ve harç hariç {tl(s.borclandirma)} TL olarak borçlandırılmasına"
    )
    return bas + orta + son


def ozet_satirlari(s):
    """Ekran/Excel icin ay ay tablo satirlari."""
    return [(f"{k.ay_adi} {k.yil}", k.gun, tl(k.ceyrek), tl(k.tutar), k.aciklama)
            for k in s.kalemler]
