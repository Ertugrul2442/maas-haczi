"""Sayfanin asgari ucret tablosunu INTERNETTEN guncellemesinin kiyasi -- Python yarisi.

NEDEN VAR (11.09.2026): index.html acilista tablonun gunceli icin uc adrese
cikiyor (cevrimiciGuncelle). Bu yolun dogru calistigini "sayfa acildi" ile
degil, SONUCLA olcmek lazim: internetten yeni bir yil geldiginde hesap
gercekten o rakamla mi yapiliyor, bozuk tablo gercekten reddediliyor mu,
internet yokken dosyanin icindeki tabloya mi donuluyor.

Bu betik:
  1) 2026 Ekim -> 2027 Subat arasi SENTETIK bir SGK dokumu yazar (kisisel
     veri yok). 2027 aylari, gomulu tabloda (son donem 2026-01) OLMAYAN bir
     yila dusuyor -- farkin gorunecegi yer tam orasi.
  2) "Internetten gelmis" sahte bir tablo kurar: depodaki ayarlar.json +
     uydurma 2027-01 donemi (net 30.000, 1/4 7.500).
  3) Ayni dokumu MASAUSTU motoruyla (hesap.py) IKI tabloyla hesaplar:
     gomulu ve sahte. Tarayici tarafinin bulmasi gereken rakamlar bunlar.
  4) Sayfanin REDDETMESI gereken bes bozuk tablo uretir.

    py -3.13 web/kiyas_cevrimici.py > web/kiyas_cevrimici_veri.json
    node web/kiyas_cevrimici.js web/kiyas_cevrimici_veri.json
"""

import copy
import json
import os
import sys
import tempfile

sys.stdout.reconfigure(encoding="utf-8")
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, KOK)
sys.path.insert(0, os.path.join(KOK, "web"))

from hesap import Ayarlar, dokum_oku, hesapla, tarih_coz  # noqa: E402
from kiyas_dokum import yaz_xls, _baslik_satiri  # noqa: E402

CIKTI_KLASOR = os.path.join(KOK, "web", "kiyas_cevrimici_dosya")
ISYERI = "900099"
TEBLIG = "01.10.2026"
KARAR = "28.02.2027"

# Uydurma 2027 donemi. Degerler BILEREK sayfanin denetimini gececek sekilde
# secildi (net/brut = 0,85, 1/4 = net/4, oncekinden yuksek); yoksa "dogru
# tablo" senaryosu kendiliginden reddedilir ve kiyas bir sey olcmez.
SAHTE_2027 = {"baslangic": "2027-01", "net": 30000.0, "ceyrek": 7500.0,
              "brut": 35294.12}


def _dokum_yaz():
    satirlar = [_baslik_satiri()]
    aylar = [(2026, 10, 33030.00), (2026, 11, 33030.00), (2026, 12, 33030.00),
             (2027, 1, SAHTE_2027["brut"]), (2027, 2, SAHTE_2027["brut"])]
    for i, (yil, ay, pek) in enumerate(aylar):
        satirlar.append(["4a", "YIL GECISI ORNEK", ISYERI, f"{yil}/{ay}",
                         "01.01.2020" if i == 0 else "", "30", f"{pek:.2f}", "", ""])
    os.makedirs(CIKTI_KLASOR, exist_ok=True)
    yol = os.path.join(CIKTI_KLASOR, "yil_gecisi.xls")
    yaz_xls(yol, [("Sayfa1", satirlar)])
    return yol


def _hesap(dokum, tablo):
    """Masaustu motoruyla hesap. `tablo`: ayarlar.json bicimindeki sozluk."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as f:
        json.dump(tablo, f)
        gecici = f.name
    try:
        ayarlar = Ayarlar.yukle(gecici)
    finally:
        os.remove(gecici)
    kayitlar, kisi, _ = dokum_oku(dokum)
    s = hesapla(kayitlar, ISYERI, tarih_coz(TEBLIG), tarih_coz(KARAR), None,
                ayarlar, kisi)
    return {
        "toplam": s.toplam,
        "borclandirma": s.borclandirma,
        "kalemler": [{"yil": k.yil, "ay": k.ay, "gun": k.gun, "ceyrek": k.ceyrek,
                      "net": k.net, "tutar": k.tutar} for k in s.kalemler],
        "tablo_eski_uyarisi": any("TABLOSU ESKI" in u for u in s.uyarilar),
    }


def _bozuklar(gomulu):
    """Sayfanin REDDETMESI gereken tablolar -> (tablo, beklenen sebep parcasi)."""
    b = {}

    t = copy.deepcopy(gomulu)
    t["donemler"].append(dict(SAHTE_2027, net=36000.0, ceyrek=9000.0))
    b["net_brutten_buyuk"] = (t, "net ile brüt birbirini tutmuyor")

    t = copy.deepcopy(gomulu)
    t["donemler"] = [d for d in t["donemler"] if d["baslangic"] != "2025-01"]
    b["donem_eksik"] = (t, "01/2025 dönemi internetteki tabloda yok")

    t = copy.deepcopy(gomulu)
    t["donemler"].append(dict(SAHTE_2027, ceyrek=7600.0))
    b["ceyrek_tutmuyor"] = (t, "1/4 tutarı net ücretle uyuşmuyor")

    t = copy.deepcopy(gomulu)
    t["donemler"].append({"baslangic": "2027-01", "net": 20000.0,
                          "ceyrek": 5000.0, "brut": 23529.41})
    b["ucret_dusmus"] = (t, "net ücret bir önceki dönemden düşük")

    t = copy.deepcopy(gomulu)
    t["oran"] = 0.3
    b["oran_degismis"] = (t, "kesinti oranı ya da ay gün sayısı değişmiş")
    return b


def main():
    with open(os.path.join(KOK, "ayarlar.json"), encoding="utf-8") as f:
        gomulu = json.load(f)
    sahte = copy.deepcopy(gomulu)
    sahte["donemler"].append(dict(SAHTE_2027))

    dokum = _dokum_yaz()
    beklenen_gomulu = _hesap(dokum, gomulu)
    beklenen_cevrimici = _hesap(dokum, sahte)

    # Kiyasin kendisi bir sey olcuyor mu? Iki tablo AYNI sonucu verirse
    # "internetten gelen tablo kullanildi" iddiasi hicbir sekilde sinanmaz.
    if beklenen_gomulu["toplam"] == beklenen_cevrimici["toplam"]:
        raise SystemExit("HATA: iki tablo ayni toplami veriyor -- kiyas bir sey olcmez")
    if not beklenen_gomulu["tablo_eski_uyarisi"] or beklenen_cevrimici["tablo_eski_uyarisi"]:
        raise SystemExit("HATA: 'tablo eski' uyarisi beklenen gibi ayrismiyor")

    json.dump({
        "dosya": dokum,
        "teblig": TEBLIG,
        "karar": KARAR,
        "isyeri": ISYERI,
        "gomulu_tablo": gomulu,
        "sahte_tablo": sahte,
        "bozuklar": {ad: {"tablo": t, "sebep": s} for ad, (t, s) in _bozuklar(gomulu).items()},
        "beklenen": {"gomulu": beklenen_gomulu, "cevrimici": beklenen_cevrimici},
    }, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
