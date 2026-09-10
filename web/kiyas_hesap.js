// hesap.js'i Python'un hesap.py'sine karsi tarar.
//
// Kullanim:
//   py -3.13 web/kiyas_hesap.py > web/kiyas_hesap_veri.json
//   node web/kiyas_hesap.js web/kiyas_hesap_veri.json
//
// Kiyas SADECE tutari degil, her kalemin butun alanlarini, UYARILARIN
// tamamini, TUTANAK METNINI ve tablo satirlarini harfi harfine kiyasliyor.
// Sebep: bu projede "sayi dogru, metin yanlis" turu sessiz hatalar uc kez
// yasandi. Sayiya bakip gecmek yetmiyor.

"use strict";

const fs = require("fs");
const path = require("path");
const H = require("./hesap.js");

const KALEM_ALAN = ["yil", "ay", "gun", "ceyrek", "net", "tutar", "aciklama",
  "pek", "pek_30", "asgari_ustu", "teyit", "net_kaynak", "kumulatif"];

let toplam = 0;
let hata = 0;
const ornekler = [];

function karsilastir(baslik, cikan, beklenen) {
  toplam += 1;
  const a = JSON.stringify(cikan);
  const b = JSON.stringify(beklenen);
  if (a !== b) {
    hata += 1;
    if (ornekler.length < 12) {
      ornekler.push("  " + baslik + "\n    python: " + b + "\n    js    : " + a);
    }
  }
}

function main() {
  const yol = process.argv[2] || "web/kiyas_hesap_veri.json";
  if (!fs.existsSync(yol)) {
    console.error("Veri dosyasi yok: " + yol);
    console.error("Once calistir:  py -3.13 web/kiyas_hesap.py > " + yol);
    return 1;
  }
  const veri = JSON.parse(fs.readFileSync(yol, "utf8"));
  const ayarlar = H.Ayarlar.kur(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "ayarlar.json"), "utf8")));

  // --- 1) Yardimci fonksiyonlar ------------------------------------------
  for (const y of veri.yardimcilar) {
    const g = y.girdi;
    let c;
    try {
      if (y.tip === "tl") c = [H.tl(Number(g[0]))];
      else if (y.tip === "ad_bicimle") c = [H.ad_bicimle(g[0])];
      else if (y.tip === "ek_ilgi") c = [H.ek_ilgi(g[0])];
      else if (y.tip === "ek_yonelme") c = [H.ek_yonelme(g[0])];
      else if (y.tip === "buyuk_harf") c = [H.buyuk_harf(g[0])];
      else if (y.tip === "kucuk_harf") c = [H.kucuk_harf(g[0])];
      else if (y.tip === "daire_bicimle") c = [H.daire_bicimle(g[0])];
      else if (y.tip === "tarih_coz") c = [H.tarih_str(H.tarih_coz(g[0]))];
      else if (y.tip === "para_coz") c = [_pyRepr(H.para_coz(g[0]))];
      else throw new Error("bilinmeyen tip: " + y.tip);
    } catch (e) {
      c = ["PATLADI: " + e.message];
    }
    karsilastir(y.tip + " " + JSON.stringify(g), c, y.bekle);
  }

  // --- 2/3) Her dokum icin kol ozeti, kol uyarisi ve isveren listeleri ----
  for (const ad of Object.keys(veri.dokumler)) {
    const d = veri.dokumler[ad];
    karsilastir("kol_ozeti [" + ad + "]", H.kol_ozeti(d.kayitlar), d.kol_ozeti);
    karsilastir("kol_uyarisi [" + ad + "]", H.kol_uyarisi(d.kayitlar), d.kol_uyarisi);
    for (const l of d.isveren_listeleri) {
      const t = l.girdi[0] ? H.tarih_coz(l.girdi[0]) : null;
      const k = l.girdi[1] ? H.tarih_coz(l.girdi[1]) : null;
      const cikan = H.isverenleri_listele(d.kayitlar, t, k).map(H.isveren_etiket);
      karsilastir("isverenleri_listele [" + ad + "] " + JSON.stringify(l.girdi),
        cikan, l.bekle);
    }
  }

  // --- 4) Senaryolar (asil is) -------------------------------------------
  for (const s of veri.senaryolar) {
    const g = s.girdi;
    const ad = "hesapla [" + g.dokum + "] " + g.isyeri + " t=" + g.teblig
      + " k=" + g.karar + " borc=" + g.dosya_borcu + " " + g.kusur;
    const kayitlar = veri.dokumler[g.dokum].kayitlar;
    let cikan;
    try {
      const r = H.hesapla(kayitlar, g.isyeri, H.tarih_coz(g.teblig),
        H.tarih_coz(g.karar), g.dosya_borcu, ayarlar, veri.kisi, g.kusur);
      cikan = {
        kisi: r.kisi, isyeri: r.isyeri,
        teblig: H.tarih_str(r.teblig), karar: H.tarih_str(r.karar),
        toplam: r.toplam, dosya_borcu: r.dosya_borcu,
        borclandirma: r.borclandirma, calisma_bitisi: r.calisma_bitisi,
        halen_calisiyor: r.halen_calisiyor, uyarilar: r.uyarilar,
        pek_ay_sayisi: r.pek_ay_sayisi, veri_yok_ay: r.veri_yok_ay,
        kusur: r.kusur,
        kalemler: r.kalemler.map((k) => {
          const o = {};
          for (const a of KALEM_ALAN) o[a] = k[a];
          return o;
        }),
        tutanak: H.tutanak_metni(r),
        ozet: H.ozet_satirlari(r),
      };
    } catch (e) {
      cikan = { hata: e.message };
    }
    if (s.hata !== undefined) {
      karsilastir(ad, cikan.hata === undefined ? cikan : cikan.hata, s.hata);
    } else {
      karsilastir(ad, cikan, s.sonuc);
    }
  }

  console.log("=".repeat(72));
  console.log("hesap.js  <->  hesap.py  KIYASI");
  console.log("=".repeat(72));
  console.log("  kaynak           : "
    + (veri.sentetik_mi ? "SADECE SENTETIK (kisisel veri yok)" : "sentetik + gercek dokum"));
  console.log("  dokum sayisi     : " + Object.keys(veri.dokumler).length);
  console.log("  senaryo sayisi   : " + veri.senaryolar.length);
  console.log("  toplam kiyas     : " + toplam);
  console.log("  FARK             : " + hata);
  if (ornekler.length) {
    console.log("\nIlk farklar:");
    for (const o of ornekler) console.log(o);
  }
  console.log("=".repeat(72));
  console.log(hata === 0 ? "  SONUC: PORT BIREBIR TUTUYOR" : "  SONUC: PORT AYRISIYOR");
  return hata === 0 ? 0 : 1;
}

// Python'un repr(float)'unun karsiligi: 33121.92 -> "33121.92", 0 -> "0.0"
function _pyRepr(x) {
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  return String(x);
}

process.exit(main());
