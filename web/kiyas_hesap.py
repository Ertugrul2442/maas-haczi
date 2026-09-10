# -*- coding: utf-8 -*-
"""
hesap.py'nin sonuclarini JSON'a doker; web/kiyas_hesap.js ayni girdileri JS
portuna verip alan alan kiyaslar.

NEDEN VAR: bu projede "sayi dogru, metin yanlis" turu sessiz hatalar tekrar
tekrar cikti (CLAUDE.md'de uc ayri vaka kayitli). O yuzden kiyas sadece
tutari degil, UYARILARI, TUTANAK METNINI ve tablo satirlarini da harfi
harfine kiyasliyor.

IKI KAYNAK VAR, ikisi de gerekli:

  SENTETIK dokumler (--sentetik) -- elle kurulmus, KISISEL VERI ICERMEZ,
      lll.xls gerektirmez, CI'da kosar. Amaclari gercek dokumun UGRAMADIGI
      kod yollarini zorlamak. Bunun bosuna olmadigi olculdu: hesap.js'te
      "kazanc bilgisi yok" uyarisi ve teyit toleransinin siniri bilerek
      bozuldugunda gercek dokum bunu YAKALAMIYORDU (o dokumde oyle ay yok).

  GERCEK dokum (lll.xls) -- gunluk hayattaki dosyanin kendisi. Kisisel veri
      icerir; ciktisi .gitignore'da, depoya GIRMEZ, CI'da kosmaz.

Kullanim:
    py -3.13 web/kiyas_hesap.py            > web/kiyas_hesap_veri.json
    py -3.13 web/kiyas_hesap.py --sentetik > web/kiyas_hesap_veri.json
    node web/kiyas_hesap.js web/kiyas_hesap_veri.json
"""

import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, KOK)

import hesap

DOKUM = os.path.join(KOK, "lll.xls")

# Teblig gunu bilerek uclari da kapsiyor: 1 (kalan 29), 25 (karardaki dosya),
# 29 ve 30 (kalan 1 ve 0 -- ikincisi ayi tamamen dusuruyor).
TEBLIG_GUNLERI = [1, 5, 10, 25, 29, 30]
BORCLAR = [0.0, 33121.92, 1000000.0]
KUSURLAR = ["cevap-yok", "kesinti-yok"]

KALEM_ALAN = ["yil", "ay", "gun", "ceyrek", "net", "tutar", "aciklama",
              "pek", "pek_30", "asgari_ustu", "teyit", "net_kaynak", "kumulatif"]


def kayit_dok(k):
    return {"kol": k.kol, "isyeri": k.isyeri, "yil": k.yil, "ay": k.ay,
            "gun": k.gun, "giris": k.giris, "cikis": k.cikis,
            "eksik_neden": k.eksik_neden, "ad": k.ad, "pek": k.pek}


def sonuc_dok(s):
    return {
        "kisi": s.kisi, "isyeri": s.isyeri,
        "teblig": hesap.tarih_str(s.teblig), "karar": hesap.tarih_str(s.karar),
        "toplam": s.toplam, "dosya_borcu": s.dosya_borcu,
        "borclandirma": s.borclandirma, "calisma_bitisi": s.calisma_bitisi,
        "halen_calisiyor": s.halen_calisiyor, "uyarilar": list(s.uyarilar),
        "pek_ay_sayisi": s.pek_ay_sayisi, "veri_yok_ay": s.veri_yok_ay,
        "kusur": s.kusur,
        "kalemler": [{a: getattr(k, a) for a in KALEM_ALAN} for k in s.kalemler],
        "tutanak": hesap.tutanak_metni(s),
        "ozet": [list(r) for r in hesap.ozet_satirlari(s)],
    }


def K(kol, isyeri, yil, ay, gun, pek, cikis="", eksik="", ad="ORNEK KISI"):
    return hesap.Kayit(kol=kol, isyeri=isyeri, yil=yil, ay=ay, gun=gun,
                       giris="", cikis=cikis, eksik_neden=eksik, ad=ad, pek=pek)


# 2025 brut asgari ucret; sentetik dokumler bunun etrafinda kuruluyor.
ASG25 = 26005.50
ASG26 = 33030.00


def sentetik_dokumler():
    """Gercek dokumun UGRAMADIGI kod yollarini zorlayan uydurma dokumler.

    Hicbiri gercek kisiye ait degil; hepsi elle yazildi.
    """
    d = {}

    # 1) Kazanc bilgisi HIC YOK -> "veri-yok" yolu ve !!! uyarisi.
    d["bos_pek"] = [K("4a", "900001", 2025, a, 30, 0.0) for a in range(1, 13)]

    # 2) Teyit toleransinin TAM SINIRI: |pek_30 - brut| == 1.0 kabul edilmeli
    #    (<= 1.0). Bir kurus otesi (1.01) asgari-ustu olmali. Gercek dokumde
    #    boyle bir ay yok, o yuzden sinir orada hic denenmiyor.
    d["sinir"] = [
        K("4a", "900002", 2025, 1, 30, ASG25),           # tam esit
        K("4a", "900002", 2025, 2, 30, ASG25 + 1.00),    # tam sinir, ustten
        K("4a", "900002", 2025, 3, 30, ASG25 - 1.00),    # tam sinir, alttan
        K("4a", "900002", 2025, 4, 30, ASG25 + 1.01),    # sinirin bir kurus otesi
        K("4a", "900002", 2025, 5, 30, ASG25 - 1.01),
        K("4a", "900002", 2025, 6, 30, ASG25 + 0.99),
    ]

    # 3) Asgari ucretin ALTINDA -> "kazanc asgari ucretin ALTINDA" uyarisi.
    d["asgari_alti"] = [K("4a", "900003", 2025, a, 30, ASG25 * 0.6)
                        for a in range(1, 7)]

    # 4) Ayni ayda IKI isveren -> GVK 23/1-18, istisna sadece en yuksege.
    #    Dusuk olan isyeri hesaplandiginda "istisnasiz" uyarisi cikmali.
    d["coklu"] = []
    for a in range(1, 7):
        d["coklu"].append(K("4a", "900004", 2025, a, 30, 45000.00))
        d["coklu"].append(K("4a", "900005", 2025, a, 30, 60000.00))

    # 5) Ayni ay birden fazla satir; gun toplami 30'u ASIYOR -> kirpma uyarisi
    #    ve PEK'in de toplanmasi (eskiden sadece son satirinki aliniyordu).
    d["cok_satir"] = [
        K("4a", "900006", 2025, 1, 20, 20000.00),
        K("4a", "900006", 2025, 1, 17, 10000.00),        # toplam 37 gun -> 30
        K("4a", "900006", 2025, 2, 17, 11334.75),
        K("4a", "900006", 2025, 2, 1, 666.75),           # gercek ornegin benzeri
        K("4a", "900006", 2025, 3, 30, ASG25),
    ]

    # 6) Arada KAYIT OLMAYAN ay -> "bu ay SGK kaydi yok" uyarisi.
    d["bosluk"] = [K("4a", "900007", 2025, a, 30, ASG25)
                   for a in (1, 2, 5, 6)]

    # 7) Tarifesi TANIMLI OLMAYAN yil -> net_maas NetMaasHatasi firlatir,
    #    hesap onu yakalayip asgariye duser ve BAGIRIR. Ayrica ayarlar.json
    #    bayat oldugu icin "TABLO ESKI" uyarisi da cikmali.
    d["gelecek"] = [K("4a", "900008", 2027, a, 30, ASG26 * 2) for a in range(1, 7)]

    # 8) Karisik kollar -> kol_uyarisi'nin "4a DISI KAYIT DA VAR" dali.
    d["karisik_kol"] = (
        [K("4a", "900009", 2025, a, 30, ASG25) for a in range(1, 7)]
        + [K("4c", "900010", 2025, a, 30, ASG25) for a in range(1, 7)]
        + [K("4b", "900011", 2025, a, 30, 3577.50) for a in range(1, 4)]
    )

    # 9) SADECE 4c -> hesapla hata vermeli, sebebi memur aciklamasi olmali.
    d["sadece_4c"] = [K("4c", "900012", 2025, a, 30, ASG25) for a in range(1, 7)]

    # 10) Eksik gun + cikis tarihi -> aciklama metni ve calisma_bitisi dallari.
    d["eksik_gun"] = [
        K("4a", "900013", 2025, 1, 30, ASG25),
        K("4a", "900014", 2025, 2, 12, ASG25 / 30 * 12, eksik="01"),
        K("4a", "900013", 2025, 2, 12, ASG25 / 30 * 12, eksik="01"),
        K("4a", "900013", 2025, 3, 7, ASG25 / 30 * 7, cikis="08.03.2025"),
    ]

    # 11) Yil siniri: kumulatif her Ocak'ta sifirlanmali.
    d["yil_gecisi"] = ([K("4a", "900015", 2025, a, 30, 50000.00) for a in range(7, 13)]
                       + [K("4a", "900015", 2026, a, 30, 50000.00) for a in range(1, 7)])

    return d


def sentetik_senaryolar(dokumler):
    """Her sentetik dokum icin makul teblig/karar araliklari."""
    s = []
    for ad, kayitlar in dokumler.items():
        aylar = sorted({(k.yil, k.ay) for k in kayitlar})
        isyerleri = sorted({k.isyeri for k in kayitlar})
        ilk, son = aylar[0], aylar[-1]
        for isyeri in isyerleri:
            for tg in (1, 10, 25, 29, 30):
                for borc in (0.0, 50000.0):
                    s.append({
                        "dokum": ad, "isyeri": isyeri,
                        "teblig": "%02d.%02d.%04d" % (tg, ilk[1], ilk[0]),
                        "karar": "28.%02d.%04d" % (son[1], son[0]),
                        "dosya_borcu": borc, "kusur": "cevap-yok",
                    })
            # Bir de karar tarihi ortada kalan hal
            orta = aylar[len(aylar) // 2]
            s.append({
                "dokum": ad, "isyeri": isyeri,
                "teblig": "05.%02d.%04d" % (ilk[1], ilk[0]),
                "karar": "15.%02d.%04d" % (orta[1], orta[0]),
                "dosya_borcu": 0.0, "kusur": "kesinti-yok",
            })
    return s


def yardimci_kayitlari():
    """Bicimlendirme ve Turkce ek fonksiyonlari -- kolayca sessizce bozulurlar."""
    cikti = []

    paralar = ["0", "1234.5", "37798.14", "-1234.5", "0.005", "-0.005",
               "1234.125", "0.125", "999999.999", "5526.165", "7018.875",
               "1e6", "0.001"]
    for v in paralar:
        cikti.append({"tip": "tl", "girdi": [v], "bekle": [hesap.tl(float(v))]})

    # Unlusuz ve bos adlar bilerek var: ek_yonelme() bunlarda COKUYORDU
    # (09.09.2026'da JS portu sirasinda bulundu ve duzeltildi).
    adlar = ["ahmet yilmaz", "AHMET IŞIK YILMAZ", "ışık", "İSMAİL",
             "ÖRNEK GIDA LTD. ŞTİ.", "a.ş.", "Efe", "tek", "  bosluk  var  ",
             "ALTUNAY", "ÖZTÜRK", "ARI", "KUYU", "GÖÇ", "", "MEHMET ALİ ÇOBAN",
             "MKS", "XYZ", "GRUP 7", "ABC LTD ŞTİ"]
    for a in adlar:
        cikti.append({"tip": "ad_bicimle", "girdi": [a], "bekle": [hesap.ad_bicimle(a)]})
        cikti.append({"tip": "ek_ilgi", "girdi": [a], "bekle": [hesap.ek_ilgi(a)]})
        cikti.append({"tip": "ek_yonelme", "girdi": [a], "bekle": [hesap.ek_yonelme(a)]})
        cikti.append({"tip": "buyuk_harf", "girdi": [a], "bekle": [hesap.buyuk_harf(a)]})
        cikti.append({"tip": "kucuk_harf", "girdi": [a], "bekle": [hesap.kucuk_harf(a)]})

    for d in ["3", "3.", "12", "ornekil 3. icra dairesi", "İcra", "", "  7 "]:
        cikti.append({"tip": "daire_bicimle", "girdi": [d],
                      "bekle": [hesap.daire_bicimle(d)]})

    for t in ["25.11.2025", "25/11/2025", "2025-11-25", "01.01.2026",
              "29.02.2024", "5.7.2025"]:
        cikti.append({"tip": "tarih_coz", "girdi": [t],
                      "bekle": [hesap.tarih_str(hesap.tarih_coz(t))]})

    for p in ["33.121,92", "33121.92", "", "  1.000,00 TL ", "0", "5,5"]:
        cikti.append({"tip": "para_coz", "girdi": [p],
                      "bekle": [repr(hesap.para_coz(p))]})
    return cikti


def senaryo_kos(kayitlar, s, ayarlar, kisi):
    try:
        r = hesap.hesapla(kayitlar, s["isyeri"], hesap.tarih_coz(s["teblig"]),
                          hesap.tarih_coz(s["karar"]), s["dosya_borcu"],
                          ayarlar, kisi=kisi, kusur=s["kusur"])
        return {"girdi": s, "sonuc": sonuc_dok(r)}
    except ValueError as e:
        return {"girdi": s, "hata": str(e)}


def main():
    sadece_sentetik = "--sentetik" in sys.argv
    ayarlar = hesap.Ayarlar.yukle()

    dokumler = sentetik_dokumler()
    senaryolar = sentetik_senaryolar(dokumler)
    kisi = "ORNEK KISI"
    dokum_uyari = []

    if not sadece_sentetik:
        if not os.path.exists(DOKUM):
            sys.stderr.write("lll.xls yok, sadece sentetik kosuluyor.\n")
            sadece_sentetik = True
        else:
            gercek, ad, dokum_uyari = hesap.dokum_oku(DOKUM)
            dokumler["gercek"] = gercek
            kisi = ad
            isyerleri = sorted({k.isyeri for k in gercek
                                if k.kol == "4a" and k.isyeri})
            aylar = sorted({(k.yil, k.ay) for k in gercek if k.kol == "4a"})
            for isyeri in isyerleri:
                kendi = sorted({(k.yil, k.ay) for k in gercek
                                if k.kol == "4a" and k.isyeri == isyeri})
                adaylar = [kendi[0], kendi[len(kendi) // 2], kendi[-1], aylar[0]]
                for (ty, ta) in adaylar:
                    for tg in TEBLIG_GUNLERI:
                        for (ky, ka), kg in [(kendi[-1], 28), (kendi[-1], 5),
                                             (kendi[len(kendi) // 2], 15)]:
                            for borc in BORCLAR:
                                for kusur in KUSURLAR:
                                    senaryolar.append({
                                        "dokum": "gercek", "isyeri": isyeri,
                                        "teblig": "%02d.%02d.%04d" % (tg, ta, ty),
                                        "karar": "%02d.%02d.%04d" % (kg, ka, ky),
                                        "dosya_borcu": borc, "kusur": kusur,
                                    })

    sonuclar = [senaryo_kos(dokumler[s["dokum"]], s, ayarlar, kisi)
                for s in senaryolar]

    # Isveren listesi ve kol ozeti her dokum icin
    dokum_bilgi = {}
    for ad, kayitlar in dokumler.items():
        liste = []
        for teblig, karar in [(None, None), ("25.11.2025", "28.08.2026"),
                              ("01.01.2024", "31.12.2024")]:
            t = hesap.tarih_coz(teblig) if teblig else None
            k = hesap.tarih_coz(karar) if karar else None
            liste.append({
                "girdi": [teblig, karar],
                "bekle": [o.etiket() for o in hesap.isverenleri_listele(kayitlar, t, k)],
            })
        dokum_bilgi[ad] = {
            "kayitlar": [kayit_dok(k) for k in kayitlar],
            "kol_ozeti": hesap.kol_ozeti(kayitlar),
            "kol_uyarisi": hesap.kol_uyarisi(kayitlar),
            "isveren_listeleri": liste,
        }

    veri = {
        "sentetik_mi": sadece_sentetik,
        "kisi": kisi,
        "dokum_uyari": dokum_uyari,
        "dokumler": dokum_bilgi,
        "senaryolar": sonuclar,
        "yardimcilar": yardimci_kayitlari(),
    }
    json.dump(veri, sys.stdout, ensure_ascii=False)
    print()
    hatali = sum(1 for k in sonuclar if "hata" in k)
    sys.stderr.write(
        "%s | %d dokum, %d senaryo (%d'i hata dondurdu), %d yardimci\n"
        % ("SADECE SENTETIK" if sadece_sentetik else "sentetik + gercek",
           len(dokumler), len(sonuclar), hatali, len(veri["yardimcilar"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
