# -*- coding: utf-8 -*-
"""
MASAUSTU ARAYUZ (arayuz.py) ile WEB ARAYUZU (web/index.html) kiyasi.

NEDEN AYRI BIR KIYAS: web/kiyas_hesap.js hesap MOTORUNU kiyasliyor, yani
"ayni girdiye ayni sayi" sorusunu cevapliyor. Ama arayuz baska bir sey:
motoru DOGRU BAGLIYOR MU? Yanlis sirayla parametre gecmek, yanlis alani
gostermek, satiri yanlis renge boyamak, uyariyi hic yazmamak -- bunlarin
hicbirini motor kiyasi yakalamaz, cunku motor kusursuz calisiyor olur.

Bu projede tam bu sinifta UC hata yasandi ("sayi dogru, metin yanlis") ve
ucu de ancak cikti GOZLE okunarak bulundu. Burada gozun yerini kiyas aliyor.

Bu dosya, masaustu arayuzun EKRANA YAZACAGI seyi uretir:
  - dosya okunduktan sonraki isveren listesi (tarihler girilmeden)
  - tarihler girildikten sonraki liste
  - HESAPLA sonrasi durum cubugu cumlesi
  - tablonun her hucresi VE her satirin rengi (tkinter tag -> CSS sinifi)
  - tutanak metninin tamami
  - Uyarilar sekmesinin her satiri

web/kiyas_arayuz.js ayni senaryolari gercek bir tarayicida (Chromium,
playwright) file:// ile acip DOM'dan okur ve alan alan kiyaslar.

Senaryolar iki gruba ayriliyor:
  - "sentetik:*"  kisisel veri ICERMEZ, xlwt ile uretilir, CI'da kosar.
  - "gercek:*"    lll.xls'i kullanir, kisisel veri icerir, CI'da kosmaz.

Kullanim:
    py -3.13 web/kiyas_arayuz.py            > web/kiyas_arayuz_veri.json
    py -3.13 web/kiyas_arayuz.py --sentetik > web/kiyas_arayuz_veri.json
    node web/kiyas_arayuz.js web/kiyas_arayuz_veri.json
"""

import json
import os
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, KOK)

import hesap
from hesap import (Ayarlar, dokum_oku, isverenleri_listele, hesapla,
                   kol_ozeti, KOL_ADI, tutanak_metni, tarih_coz, para_coz, tl,
                   borc_girildi)
import disa_aktar
from docx import Document
from docx.oxml.ns import qn

from kiyas_dokum import yaz_xls, _baslik_satiri

DOKUM = os.path.join(KOK, "lll.xls")
CIKTI_KLASOR = os.path.join(KOK, "web", "kiyas_arayuz_dosya")

# arayuz.py'deki tag adlari -> web'deki CSS sinif adlari. Ayni anlam,
# ayni satir. Bu esleme kiyasin kendisi kadar onemli: satirin RENGI
# "bu ay teyitli mi, tahmin mi" bilgisini tasiyor.
SINIF = {"pek": "pekten", "asgari": "teyitli", "veri-yok": "dikkat"}

ISARET = {
    "pek": "MAAŞI SGK KAZANCINDAN HESAPLANDI — Uyarılar'a bak",
    "asgari": "SGK'da tam asgari ücret yazıyor",
    "veri-yok": "!!! KAZANÇ BİLGİSİ YOK — Uyarılar'a bak",
}


# --------------------------------------------------------------------------
# Sentetik dokumler -- her biri ARAYUZUN bir kod yolunu zorluyor
# --------------------------------------------------------------------------

def _uzun_dokum(isyeri, ad, ilk_yil, ilk_ay, ay_sayisi, gun_deseni):
    """Cok ayli sentetik dokum. Her ayin PEK'i o donemin brut asgari
    ucretiyle orantili yazilir (gun/30), boylece butun aylar "teyitli"
    cikar ve senaryo asgari ucret tablosuna baglidir, uydurma degil."""
    ayarlar = Ayarlar.yukle()
    satirlar = [_baslik_satiri()]
    yil, ay = ilk_yil, ilk_ay
    for i in range(ay_sayisi):
        gun = gun_deseni[i % len(gun_deseni)]
        brut = ayarlar.donem_bul(yil, ay)[2]
        pek = round(brut * gun / 30.0, 2)
        satirlar.append(["4a", ad, isyeri, f"{yil}/{ay}",
                         "01.01.2015" if i == 0 else "",
                         str(gun), f"{pek:.2f}", "", ""])
        ay += 1
        if ay > 12:
            ay, yil = 1, yil + 1
    return satirlar


def sentetik_dokumler():
    d = {}
    B = _baslik_satiri()

    # 1) Duz asgari ucretli dosya. Kontrol grubu: her sey teyitli (yesil).
    d["duz_asgari"] = [("Sayfa1", [
        B,
        ["4a", "AYSE ORNEK", "900001", "2026/1", "01.01.2024", "30", "33030.00", "", ""],
        ["4a", "AYSE ORNEK", "900001", "2026/2", "", "30", "33030.00", "", ""],
        ["4a", "AYSE ORNEK", "900001", "2026/3", "", "30", "33030.00", "", ""],
    ])]

    # 2) Kazanci bos ay -> "veri-yok" yolu: satir TURUNCU olmali, uyarilarda
    #    "!!!" ile bagirmali, durum cubugunda "kazanc bilgisi yok" gecmeli.
    #    Gercek lll.xls'te boyle bir ay YOK, yani bu yol ancak burada denenir.
    d["kazanc_yok"] = [("Sayfa1", [
        B,
        ["4a", "VELI ORNEK", "900002", "2026/1", "01.01.2026", "30", "33030.00", "", ""],
        ["4a", "VELI ORNEK", "900002", "2026/2", "", "30", "", "", ""],
        ["4a", "VELI ORNEK", "900002", "2026/3", "", "30", "33030.00", "", ""],
    ])]

    # 3) Asgari USTU kazanc -> "pek" yolu: satir MAVI, net kanun formuluyle
    #    hesaplanir, durum cubugu "N ayin maasi SGK kazancindan hesaplandi"
    #    demeli. Kumulatif matrah icin yil basindan itibaren tum aylar var.
    d["asgari_ustu"] = [("Sayfa1", [
        B,
        ["4a", "MEHMET ORNEK", "900003", "2026/1", "01.01.2020", "30", "65000.00", "", ""],
        ["4a", "MEHMET ORNEK", "900003", "2026/2", "", "30", "65000.00", "", ""],
        ["4a", "MEHMET ORNEK", "900003", "2026/3", "", "30", "65000.00", "", ""],
        ["4a", "MEHMET ORNEK", "900003", "2026/4", "", "30", "65000.00", "", ""],
    ])]

    # 4) Ayni aralikta IKI isveren -> "DIKKAT: bu aralikta 2 isveren var"
    #    ve Uyarilar'da "[bilgi] Bu aralikta 2 isveren vardi" satiri.
    d["iki_isveren"] = [("Sayfa1", [
        B,
        ["4a", "ZEYNEP ORNEK", "900004", "2026/1", "01.01.2026", "30", "33030.00", "", ""],
        ["4a", "ZEYNEP ORNEK", "900004", "2026/2", "", "30", "33030.00", "", ""],
        ["4a", "ZEYNEP ORNEK", "900005", "2026/1", "01.01.2026", "30", "33030.00", "", ""],
        ["4a", "ZEYNEP ORNEK", "900005", "2026/2", "", "30", "33030.00", "", ""],
        ["4a", "ZEYNEP ORNEK", "900005", "2026/3", "", "30", "33030.00", "", ""],
    ])]

    # 6) COK AY, HER AY FARKLI GUN -> tutanak cumlesi uzar ve Word'un
    #    puntosu 10,5'tan asagi iner. Bu ONEMLI: butun oteki senaryolar
    #    10,5'ta kaliyor, yani PUNTO_KADEME'nin alt kademeleri ve durum
    #    cubugunun punto yazimi HIC olculmemis oluyordu. (Olculdugunde
    #    gercek bir ayrisma cikti: Python str(10.0)="10.0", JS String(10)="10".)
    #    Tutanak ardisik ayni gunleri gruplayarak kisaltiyor, o yuzden gun
    #    sayilari bilerek surekli degistiriliyor.
    d["cok_ay"] = [("Sayfa1", _uzun_dokum("900007", "COK AYLI ORNEK",
                                          2024, 1, 30, [30, 21, 17, 12, 26]))]

    # 7) COK DAHA UZUN -> en kucuk puntoyla bile TEK SAYFAYA SIGMAZ.
    #    Bu durumda program SUSMAMALI, "2 sayfa oldu" diye uyari penceresi
    #    acmali. Uyarinin varligi baska hicbir yerde olculmuyor.
    d["tasan_tutanak"] = [("Sayfa1", _uzun_dokum("900008", "TASAN ORNEK",
                                                 2021, 1, 66,
                                                 [30, 29, 27, 24, 19, 13, 8, 3]))]

    # 5) SADECE 4c (memur) -> hesap YAPILAMAZ. Arayuzun en tehlikeli yolu:
    #    eskiden "bu tarih araliginda kayit yok" deyip YANLIS FAIL
    #    gosteriyordu, kullanici tarihle ugrasip duruyordu.
    d["sadece_memur"] = [("Sayfa1", [
        B,
        ["4c", "HASAN ORNEK", "900006", "2026/1", "", "30", "26005.50", "", ""],
        ["4c", "HASAN ORNEK", "900006", "2026/2", "", "30", "26005.50", "", ""],
    ])]

    return d


# --------------------------------------------------------------------------
# Masaustu arayuzun EKRANA YAZACAGI seyi uret
# --------------------------------------------------------------------------

def _tablo_satirlari(s):
    """arayuz.Uygulama._sonucu_goster()'in tabloya bastigi satirlarin aynisi."""
    satirlar = []
    for k in s.kalemler:
        isaret = ISARET.get(k.net_kaynak, "")
        not_ = k.aciklama
        if isaret:
            not_ = (not_ + "  |  " if not_ else "") + isaret
        satirlar.append({
            "sinif": SINIF.get(k.net_kaynak, ""),
            "hucreler": [f"{k.ay_adi} {k.yil}", str(k.gun), tl(k.pek_30),
                         tl(k.net), tl(k.ceyrek), tl(k.tutar), not_],
        })

    satirlar.append({"sinif": "bosluk", "hucreler": []})
    satirlar.append({"sinif": "toplam",
                     "hucreler": ["TOPLAM", "", "", "", "", tl(s.toplam),
                                  "kesilmesi gerekip kesilmeyen"]})
    if borc_girildi(s):
        satirlar.append({"sinif": "toplam",
                         "hucreler": ["Dosya borcu", "", "", "", "",
                                      tl(s.dosya_borcu), ""]})
        ust = ("dosya borcu üst sınır olduğu için"
               if s.borclandirma < s.toplam
               else "toplam dosya borcunu aşmadığı için")
    else:
        ust = "dosya borcu girilmedi, çıkan tutarın tamamı"
    satirlar.append({"sinif": "sonuc",
                     "hucreler": ["BORÇLANDIRMA", "", "", "", "",
                                  tl(s.borclandirma),
                                  f"{ust} (faiz ve harç hariç)"]})
    return satirlar


def _uyari_satirlari(s, okuma_uyarilari, isveren_sayisi):
    tum = [f"[dosya okuma] {u}" for u in okuma_uyarilari] + \
          [f"[hesap] {u}" for u in s.uyarilar]
    tum.append(f"[bilgi] Çalışma bitişi: {s.calisma_bitisi}")
    tum.append(f"[bilgi] Seçilen işyeri: {s.isyeri}")
    tum.append("[bilgi] Maaş kaynağı: SGK hizmet dökümünün kendisi (PEK "
               "sütunu). Program dışarıdan maaş sormuyor, varsayım "
               "yapmıyor.")
    if isveren_sayisi > 1:
        tum.append(f"[bilgi] Bu aralıkta {isveren_sayisi} işveren vardı, "
                   f"biri seçildi.")
    return tum


def _hesap_durumu(s):
    """HESAPLA'dan sonraki durum cubugu cumlesi."""
    n = len(s.kalemler)
    if s.pek_ay_sayisi:
        kaynak = (f"{s.pek_ay_sayisi} ayın maaşı SGK kazancından "
                  f"hesaplandı, {n - s.pek_ay_sayisi} ayda asgari ücret")
    else:
        kaynak = "SGK'da her ay tam asgari ücret yazıyor"
    if s.veri_yok_ay:
        kaynak += f" — DİKKAT: {s.veri_yok_ay} ayda kazanç bilgisi yok"
    return (f"Hesaplandı ({kaynak}) — {n} ay, toplam {tl(s.toplam)} TL, "
            f"borçlandırma {tl(s.borclandirma)} TL")


def _liste_durumu(kayitlar, etiketler, eksik):
    """isverenleri_yenile()'nin durum cubuguna yazdigi cumle."""
    if not etiketler:
        ozet = kol_ozeti(kayitlar)
        if not ozet.get("4a"):
            disi = ", ".join(f"{KOL_ADI.get(k, k)}: {n}"
                             for k, n in sorted(ozet.items()))
            return (f"Dökümde hiç 4a (işçi) kaydı YOK — {disi}. Bu program "
                    f"sadece 4a hesaplar; memur/kamu dosyasında maaş bilgisi "
                    f"kurumdan (bordro) istenmeli. Ayrıntı: Uyarılar sekmesi.")
        return ("Bu tarih aralığında hiç 4a işveren kaydı yok — "
                "tebliğ/karar tarihini kontrol et.")
    if eksik:
        return (f"{len(etiketler)} işveren listelendi (dökümün tamamı). "
                f"{' ve '.join(eksik).capitalize()} girilince liste daralacak.")
    if len(etiketler) > 1:
        return (f"DİKKAT: bu aralıkta {len(etiketler)} işveren var — "
                f"doğru olanı listeden seç.")
    return f"İşveren seçildi: {etiketler[0]}"


def _ui_bilgi(kisi, borclu_bos, form=None):
    """Web arayuzundeki 2. bolumun HESAPLA aninda tasidigi degerler.

    Kullanici hicbir alani doldurmazsa hepsi bos; tek istisna "Borçlu adı",
    onu program dosya okunurken dokumden kendisi dolduruyor (masaustunde de
    oyle). borclu_bos=True: kullanici o alani silmis demek -- o zaman Word
    borclu adini s.kisi'den almak ZORUNDA, ve bu yol baska hicbir yerde
    olculmuyor.

    form: kullanicinin ELLE doldurdugu alanlar. Bos birakilirsa mutasyon
    testinde soyle bir kor nokta cikiyor: "bilgi sozlugu yerine {} gecir"
    hicbir kiyasi bozmuyor, cunku zaten hepsi bos ve tek dolu alanin
    (borclu) yedegi ayni degeri veriyor. Yani form DOLU olan en az bir
    senaryo sart -- gercek kullanim da zaten oyle.
    """
    d = {
        "il": "", "daire": "", "dosya_no": "",
        "borclu": "" if borclu_bos else kisi,
        "isveren_adi": "", "personel": "",
        "imza_ad": "", "imza_unvan": "", "imza_sicil": "",
    }
    if form:
        d.update(form)
        # Arayuzde dosya no IKI kutu: [yil] / [sira]. Birlesmesi de
        # olculsun diye burada da ayni kural uygulaniyor.
        y, n = form.get("dosya_yil", ""), form.get("dosya_sira", "")
        d["dosya_no"] = f"{y}/{n}" if (y and n) else (y or n)
        d.pop("dosya_yil", None)
        d.pop("dosya_sira", None)
    return d


def _word_beklenen(s, bilgi):
    """Word ciktisinin metni + dosya adi + durum cubugu cumlesi.

    NEDEN: ekran kiyasi Word'un ICINI goremiyor. "Bir .docx indi" demek
    "dogru .docx indi" demek degil; arayuz sonucu ya da form bilgilerini
    yanlis gecirse ekranda hicbir sey degismez. Mutasyon testinde tam bu
    kor nokta cikti (s.kisi Word'e gecmese kimse fark etmiyordu).
    """
    yol = os.path.join(CIKTI_KLASOR, "_beklenen.docx")
    _, punto, sigar = disa_aktar.word_yaz(yol, s, bilgi, ek=False)
    d = Document(yol)
    # Belgedeki BUTUN <w:p>'ler, belge sirasiyla (tablo icindekiler dahil).
    # JS tarafi ayni tanimi kullaniyor.
    paragraflar = ["".join(t.text or "" for t in p.iter(qn("w:t")))
                   for p in d.element.body.iter(qn("w:p"))]
    os.remove(yol)

    parcalar = [p for p in (bilgi.get("dosya_no"),
                            bilgi.get("borclu") or s.kisi) if p]
    dosya_adi = ("_".join(parcalar).replace("/", "-") or "tensip") + "_tensip.docx"

    return {
        "paragraflar": paragraflar,
        "dosya_adi": dosya_adi,
        "punto": str(punto).replace(".", ","),
        "sigar": sigar,
    }


def senaryo(ad, dosya, teblig, karar, borc, kusur, isyeri, kisisel,
            borclu_bos=False, form=None):
    ayarlar = Ayarlar.yukle()
    kayitlar, kisi, okuma_uyarilari = dokum_oku(dosya)

    # (a) Tarihler girilmeden: dokumun TAMAMI listelenmeli.
    #
    # EKSIK OLAN SADECE TEBLIG TARIHI: masaustunde de webde de "karar
    # tarihi" acilista BUGUNLE DOLU geliyor (arayuz.py: tk.StringVar(
    # value=tarih_str(date.today())) / index.html: E("karar").value =
    # bugun()). Buraya iki tarihi birden yazmak ilk turda 11 sahte fark
    # uretti -- kiyasin kendisi yanlisti, program degil.
    bos = [i.etiket() for i in isverenleri_listele(kayitlar, None, None)]
    beklenen = {
        "kayit_sayisi": len(kayitlar),
        "kisi": kisi,
        "isverenler_tarihsiz": bos,
        "durum_tarihsiz": _liste_durumu(kayitlar, bos, ["tebliğ tarihi"]),
    }

    # (b) Tarihler girildikten sonra.
    t = tarih_coz(teblig)
    k = tarih_coz(karar)
    isverenler = isverenleri_listele(kayitlar, t, k)
    etiketler = [i.etiket() for i in isverenler]
    beklenen["isverenler_tarihli"] = etiketler
    beklenen["durum_tarihli"] = _liste_durumu(kayitlar, etiketler, [])

    # (c) Hesap -- 4a yoksa hic yapilmaz.
    if isyeri is None:
        beklenen["hesap_var"] = False
    else:
        s = hesapla(kayitlar, isyeri, t, k, para_coz(borc), ayarlar, kisi,
                    kusur=kusur)
        beklenen["hesap_var"] = True
        beklenen["durum_hesap"] = _hesap_durumu(s)
        beklenen["satirlar"] = _tablo_satirlari(s)
        beklenen["tutanak"] = tutanak_metni(s)
        beklenen["uyarilar"] = _uyari_satirlari(s, okuma_uyarilari,
                                                len(isverenler))
        beklenen["word"] = _word_beklenen(
            s, _ui_bilgi(kisi, borclu_bos, form))

    return {
        "ad": ad,
        "dosya": dosya,
        "kisisel": kisisel,
        "girdi": {"teblig": teblig, "karar": karar, "borc": borc,
                  "kusur": kusur, "isyeri": isyeri,
                  "borclu_bos": borclu_bos, "form": form},
        "beklenen": beklenen,
    }


def main():
    sadece_sentetik = "--sentetik" in sys.argv

    if os.path.isdir(CIKTI_KLASOR):
        shutil.rmtree(CIKTI_KLASOR)
    os.makedirs(CIKTI_KLASOR)

    yollar = {}
    for ad, sayfalar in sentetik_dokumler().items():
        yol = os.path.join(CIKTI_KLASOR, ad + ".xls")
        yaz_xls(yol, sayfalar)
        yollar[ad] = yol

    durumlar = [
        # Duz durum: hepsi teyitli (yesil), borc girilmemis -> "Dosya borcu"
        # satiri OLMAMALI ve aciklama "dosya borcu girilmedi" demeli.
        senaryo("sentetik:duz_asgari_borcsuz", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "", "cevap-yok", "900001", False),
        # Ayni dosya, borc TOPLAMIN ALTINDA -> "dosya borcu ust sinir".
        senaryo("sentetik:duz_asgari_borc_dusuk", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "5.000,00", "cevap-yok", "900001", False),
        # Ayni dosya, borc TOPLAMIN USTUNDE -> "toplam dosya borcunu asmadigi".
        senaryo("sentetik:duz_asgari_borc_yuksek", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "90.000,00", "cevap-yok", "900001", False),
        # Kusur cumlesi tutanagi degistirmeli (hesabi DEGISTIRMEMELI).
        senaryo("sentetik:duz_asgari_kesinti_yok", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "", "kesinti-yok", "900001", False),
        # Kazanci bos ay: turuncu satir + "!!!" uyarilari.
        senaryo("sentetik:kazanc_yok", yollar["kazanc_yok"],
                "01.01.2026", "20.03.2026", "", "cevap-yok", "900002", False),
        # Asgari ustu: mavi satir + PEK'ten net.
        senaryo("sentetik:asgari_ustu", yollar["asgari_ustu"],
                "01.02.2026", "20.04.2026", "", "cevap-yok", "900003", False),
        # Iki isveren: "DIKKAT ... 2 isveren var" + Uyarilar'da bilgi satiri.
        senaryo("sentetik:iki_isveren", yollar["iki_isveren"],
                "01.01.2026", "20.02.2026", "", "cevap-yok", "900005", False),
        # Sadece memur: hesap YOK, dogru sebep yazilmali.
        senaryo("sentetik:sadece_memur", yollar["sadece_memur"],
                "01.01.2026", "20.02.2026", "", "cevap-yok", None, False),
        # Kullanici "Borçlu adı" alanini SILMIS: Word borclu adini s.kisi'den
        # almak zorunda. Bu yol baska hicbir kiyasta calismiyor -- mutasyon
        # testinde tek kor nokta buydu.
        senaryo("sentetik:borclu_alani_bos", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "", "cevap-yok", "900001", False,
                borclu_bos=True),
        # Uzun tutanak -> punto 10,5'in ALTINA iner (kademe olculsun).
        senaryo("sentetik:cok_ay", yollar["cok_ay"],
                "01.01.2024", "20.06.2026", "", "cevap-yok", "900007", False),
        # Cok uzun tutanak -> tek sayfaya SIGMAZ, program uyarmali.
        senaryo("sentetik:tasan_tutanak", yollar["tasan_tutanak"],
                "01.01.2021", "20.06.2026", "", "cevap-yok", "900008", False),
        # 2. BOLUMUN TAMAMI DOLU. Baska hicbir senaryo bu alanlari
        # doldurmuyordu, o yuzden "form bilgilerini Word'e hic gecirme"
        # mutasyonu yakalanmiyordu. Ayrica dosya no'nun iki kutudan
        # birlesmesi de burada olculuyor.
        senaryo("sentetik:form_dolu", yollar["duz_asgari"],
                "05.01.2026", "20.03.2026", "12.000,00", "kesinti-yok",
                "900001", False,
                form={"il": "ornekil", "daire": "3",
                      "dosya_yil": "2025", "dosya_sira": "10000",
                      "borclu": "ahmet ışık yılmaz",
                      "isveren_adi": "ORNEK GIDA SANAYI LTD STI",
                      "personel": "ayse demir",
                      "imza_ad": "mehmet öz", "imza_unvan": "İcra Müdür Yardımcısı",
                      "imza_sicil": "123456"}),
    ]

    if not sadece_sentetik:
        if not os.path.exists(DOKUM):
            print("lll.xls yok -- sadece sentetikler uretildi.", file=sys.stderr)
        else:
            durumlar += [
                # KARARDAKI GERCEK DOSYA. Web surumunun olcutu bu:
                # 37.798,14 -> 33.121,92 vermeli.
                senaryo("gercek:karardaki_dosya", DOKUM,
                        "25.11.2025", "28.08.2026", "33.121,92",
                        "cevap-yok", "1336786", True),
                # Ayni dosya borcsuz.
                senaryo("gercek:karardaki_borcsuz", DOKUM,
                        "25.11.2025", "28.08.2026", "",
                        "cevap-yok", "1336786", True),
                # Asgari USTU ay iceren isyeri (Mayis 2025, +866,85).
                senaryo("gercek:asgari_ustu_ay", DOKUM,
                        "01.01.2025", "31.07.2025", "", "cevap-yok",
                        "1312704", True),
                # Dokumdeki en uzun isveren (27 ay) -- uzun tablo/tutanak.
                senaryo("gercek:uzun_isveren", DOKUM,
                        "01.06.2022", "31.12.2024", "", "kesinti-yok",
                        "1212871", True),
            ]

    print(json.dumps({"durumlar": durumlar}, ensure_ascii=False))
    print(f"{len(durumlar)} senaryo uretildi "
          f"({'sadece sentetik' if sadece_sentetik else 'sentetik + gercek'}).",
          file=sys.stderr)


if __name__ == "__main__":
    main()
