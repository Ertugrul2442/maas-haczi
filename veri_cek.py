"""Asgari ucreti ve gelir vergisi tarifesini resmi kaynaktan cekip yazar.

Nafaka projesindeki `veri_cek.py` kalibinda. Fark: oradaki veri HER AY
degisiyor, buradaki YILDA BIR. O yuzden bu betik gunde bir kosup cogu gun
"degisiklik yok" demek uzere yazildi -- bos is yapmasi zararsiz olmali.

    py -3.13 veri_cek.py           # ceker, dogrular, degistiyse yazar
    py -3.13 veri_cek.py --kuru    # ceker ve gosterir, HICBIR SEY YAZMAZ
    py -3.13 veri_cek.py --zorla   # makullik esiklerini atlar (insan bakarak)

Cikis kodlari (GitHub Actions bunlara bakar):
    0  yeni veri yazildi
    3  veri ayni, yazacak bir sey yok
    1  cekme/dogrulama basarisiz -> HICBIR SEY YAZILMADI, eski veri duruyor

NEDEN GUVENLIK ESIKLERI VAR: kaynaklar JSON API degil, HTML sayfasi ve PDF.
Sayfa duzeni degisirse ayristirici sacma bir sayi okuyabilir. Sacma sayinin
sessizce ayarlar.json'a girmesi, bu programda olabilecek EN PAHALI hata --
her dosyanin hesabi yanlis cikar ve kimse fark etmez. O yuzden buradaki
kontrollerin hicbiri "uyari verip devam et" degil, hepsi DURDURUR.
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import resmi_kaynak as kaynak

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

KOK = os.path.dirname(os.path.abspath(__file__))
AYARLAR = os.path.join(KOK, "ayarlar.json")

# --- makullik esikleri ------------------------------------------------------
# Asgari ucret 1974'ten beri hic DUSMEDI; en buyuk zam 2022-01'de %50 idi.
# Ust siniri genis tutuldu (yuksek enflasyon), ama sonsuz degil.
ARTIS_ALT, ARTIS_UST = 0.0, 1.50          # -%0 ile +%150
NET_ORAN_ALT, NET_ORAN_UST = 0.78, 0.92   # net/brut; 2022'den beri tam 0.85
EN_ESKI_DONEM = "2021-01"                  # bundan eskiye yazma


class DogrulamaHatasi(ValueError):
    """Cekilen veri makul degil. YAZMA, DUR."""


def _oku_ayarlar():
    with open(AYARLAR, "r", encoding="utf-8") as f:
        return json.load(f)


def _ceyrek(net, oran=0.25):
    """Netin 1/4'u, ASAGI kirpilarak (IIK 83 ust sinir -- asilmasin).

    hesap.py ve net_maas.ceyrek() ile ayni kural. DIKKAT: daire her zaman
    boyle yuvarlamiyor (2025'te 5.526,17 yazmis, asagi kirpma 5.526,16
    verir; 2026'da ikisi de 7.018,87). Otomatik eklenen donemin bu alani
    bu yuzden bir TAHMIN -- daire baska yazarsa elle duzeltilmeli.
    """
    return int(net * oran * 100) / 100.0


def _donem_kucuk(a, b):
    return a < b            # "2026-01" < "2026-07" -- metin siralamasi yeter


def dogrula(brut, net, donem, mevcut_donemler):
    """Cekilen asgari ucret makul mu. Degilse DogrulamaHatasi."""
    if not (isinstance(brut, float) and isinstance(net, float)):
        raise DogrulamaHatasi("brut/net sayi degil: %r %r" % (brut, net))
    if brut <= 0 or net <= 0:
        raise DogrulamaHatasi("brut/net pozitif degil: %s %s" % (brut, net))
    if net >= brut:
        raise DogrulamaHatasi(
            "net (%.2f) brutten (%.2f) kucuk olmali -- sutunlar karismis olabilir."
            % (net, brut))

    oran = net / brut
    if not (NET_ORAN_ALT <= oran <= NET_ORAN_UST):
        raise DogrulamaHatasi(
            "net/brut orani %.4f, beklenen araligin (%.2f-%.2f) disinda. "
            "Sayfadan yanlis hucre okunmus olabilir." % (oran, NET_ORAN_ALT, NET_ORAN_UST))

    if len(donem) != 7 or donem[4] != "-":
        raise DogrulamaHatasi("donem bicimi bozuk: %r" % donem)
    if _donem_kucuk(donem, EN_ESKI_DONEM):
        raise DogrulamaHatasi(
            "cekilen donem (%s) tablonun basladigi donemden (%s) eski."
            % (donem, EN_ESKI_DONEM))

    # Bilinen son donemle kiyasla: asgari ucret dusmez, uce katlanmaz.
    if mevcut_donemler:
        son = max(mevcut_donemler, key=lambda d: d["baslangic"])
        if not _donem_kucuk(son["baslangic"], donem):
            return                                  # ayni donem, artis kontrolu yok
        eski_brut = float(son.get("brut") or 0)
        if eski_brut > 0:
            artis = brut / eski_brut - 1
            if not (ARTIS_ALT <= artis <= ARTIS_UST):
                raise DogrulamaHatasi(
                    "brut asgari ucret %.2f -> %.2f (%%%.1f degisim), makul "
                    "araligin (%%%.0f..%%%.0f) disinda."
                    % (eski_brut, brut, artis * 100, ARTIS_ALT * 100, ARTIS_UST * 100))


def tarife_farki(cekilen_tarifeler):
    """net_maas.py'deki gomulu tarifeyle karsilastirir.

    Doner: (eksik_yillar, celisen_yillar). Gomulu tablo GIB PDF'lerinden elle
    okunup dogrulanmis; celiski varsa otomatik ustune YAZILMAZ, insana
    birakilir -- ama sessiz de kalinmaz.
    """
    import net_maas
    eksik, celisen = [], []
    for yil, dilimler in sorted(cekilen_tarifeler.items()):
        gomulu = net_maas.TARIFE.get(yil)
        if gomulu is None:
            eksik.append(yil)
            continue
        a = [(None if u is None else int(u), round(o, 4)) for u, o in dilimler]
        b = [(None if u is None else int(u), round(o, 4)) for u, o in gomulu]
        if a != b:
            celisen.append((yil, b, a))
    return eksik, celisen


def calis(kuru=False, zorla=False):
    ayarlar = _oku_ayarlar()
    donemler = ayarlar.get("donemler", [])
    oran = float(ayarlar.get("oran", 0.25))

    print("Asgari ucret cekiliyor (Calisma Bakanligi)...")
    brut, net, donem = kaynak.asgari_ucret()
    print("  donem %s   brut %.2f   net %.2f" % (donem, brut, net))

    if zorla:
        print("  ! --zorla: makullik kontrolleri ATLANDI")
    else:
        dogrula(brut, net, donem, donemler)
        print("  dogrulama gecti (net/brut = %.4f)" % (net / brut))

    yil = int(donem[:4])
    print("Gelir vergisi tarifesi cekiliyor (%d)..." % yil)
    tarifeler = {}
    try:
        tarifeler[yil] = kaynak.gelir_vergisi_tarifesi(yil)
        print("  %d dilim okundu" % len(tarifeler[yil]))
    except kaynak.KaynakHatasi as e:
        # Tarife cekilemezse asgari ucret yine de yazilabilir; ama SESSIZ GECME.
        print("  ! %d tarifesi cekilemedi: %s" % (yil, e), file=sys.stderr)

    eksik, celisen = tarife_farki(tarifeler)
    for y, gomulu, cekilen in celisen:
        print("  !!! %d TARIFESI CELISIYOR -- net_maas.py'deki tablo ile GIB'in "
              "PDF'i ayni degil. ELLE BAK, otomatik degistirilmedi.\n"
              "      gomulu : %s\n      cekilen: %s" % (y, gomulu, cekilen),
              file=sys.stderr)
    if eksik:
        print("  !!! net_maas.py'de %s yili tarifesi YOK. Asgari ucretin "
              "USTUNDE bildirilen aylar bu yil icin hesaplanamaz.\n"
              "      TARIFE sozlugune eklenecek satir:" % eksik,
              file=sys.stderr)
        for y in eksik:
            print("      %d: %s," % (y, _tarife_satiri(tarifeler[y])), file=sys.stderr)

    # --- ayarlar.json guncellemesi ---
    var_olan = next((d for d in donemler if d["baslangic"] == donem), None)
    ceyrek = _ceyrek(net, oran)

    if var_olan is not None:
        ayni = (abs(float(var_olan.get("net", 0)) - net) < 0.005
                and abs(float(var_olan.get("brut") or 0) - brut) < 0.005)
        if ayni:
            print("\nDegisiklik yok: %s donemi zaten dosyada ve rakamlar ayni." % donem)
            return 3
        print("\n!!! %s donemi dosyada VAR ama rakamlar TUTMUYOR:" % donem)
        print("      dosyada: net %s  brut %s"
              % (var_olan.get("net"), var_olan.get("brut")))
        print("      kaynakta: net %.2f  brut %.2f" % (net, brut))
        print("    Otomatik degistirilmedi -- elle bak (kaynak duzeltilmis olabilir).")
        return 1

    yeni = {"baslangic": donem, "net": net, "ceyrek": ceyrek, "brut": brut}
    print("\nYENI DONEM: %s  net %.2f  ceyrek %.2f  brut %.2f"
          % (donem, net, ceyrek, brut))
    print("  NOT: 'ceyrek' netin 1/4'u asagi kirpilarak hesaplandi. Daire bazen "
          "yukari yuvarliyor (2025'te 5.526,17 yazmis). Ilk gercek dosyada "
          "dairenin rakamiyla karsilastir.")

    if kuru:
        print("\n--kuru: dosyaya YAZILMADI.")
        return 0

    donemler.append(yeni)
    donemler.sort(key=lambda d: d["baslangic"])
    ayarlar["donemler"] = donemler
    ayarlar["_son_cekim"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(AYARLAR, "w", encoding="utf-8") as f:
        json.dump(ayarlar, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("ayarlar.json guncellendi.")
    return 0


def _tarife_satiri(dilimler):
    """net_maas.TARIFE'ye elle yapistirilabilecek satiri uretir."""
    parcalar = []
    for ust, o in dilimler:
        u = "None" if ust is None else "%d" % ust
        parcalar.append("(%s, .%02d)" % (u, round(o * 100)))
    return "[" + ", ".join(parcalar) + "]"


if __name__ == "__main__":
    try:
        sys.exit(calis(kuru="--kuru" in sys.argv, zorla="--zorla" in sys.argv))
    except (kaynak.KaynakHatasi, DogrulamaHatasi) as e:
        print("\nBASARISIZ: %s\nHicbir sey yazilmadi, eski veri duruyor." % e,
              file=sys.stderr)
        sys.exit(1)
