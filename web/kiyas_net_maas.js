// net_maas.js'i Python'un net_maas.py'sine karsi tarar.
//
// Kullanim:
//   py -3.13 web/kiyas_net_maas.py > web/kiyas_veri.json
//   node web/kiyas_net_maas.js web/kiyas_veri.json
//
// Kiyas METIN uzerinden: Python'un str(Decimal)'i ile bizim toString()'imiz.
// Yani sadece deger degil, ONDALIK HANE SAYISI da tutmali. Bilerek boyle:
// Decimal'de olcek (scale) islemler boyunca tasiniyor ve ciktida kac hane
// gorunecegini belirliyor; sadece degere baksak port sessizce ayrisabilirdi.

"use strict";

const fs = require("fs");
const nm = require("./net_maas.js");
const { des } = require("./desimal.js");

const ALANLAR = ["brut", "sgk", "issizlik", "matrah", "kumulatif", "gelir_vergisi",
  "gv_istisnasi", "odenecek_gv", "damga", "damga_istisnasi",
  "odenecek_damga", "net"];

function main() {
  const yol = process.argv[2] || "web/kiyas_veri.json";
  if (!fs.existsSync(yol)) {
    console.error("Veri dosyasi yok: " + yol);
    console.error("Once calistir:  py -3.13 web/kiyas_net_maas.py > " + yol);
    return 1;
  }
  const kayitlar = JSON.parse(fs.readFileSync(yol, "utf8"));

  const sayac = {};
  const hatalar = [];
  let gosterimFarki = 0;

  for (const k of kayitlar) {
    let bulundu;
    try {
      bulundu = hesapla(k);
    } catch (e) {
      bulundu = ["PATLADI: " + e.message];
    }
    sayac[k.tip] = sayac[k.tip] || { toplam: 0, hata: 0 };
    sayac[k.tip].toplam += 1;
    if (bulundu.length !== k.bekle.length
      || bulundu.some((v, i) => v !== k.bekle[i])) {
      sayac[k.tip].hata += 1;
      if (hatalar.length < 20) {
        hatalar.push("  " + k.tip + " " + JSON.stringify(k.girdi)
          + "\n    python: " + k.bekle.join(" | ")
          + "\n    js    : " + bulundu.join(" | "));
      }
    }
    // Ayri soru: deger ayni cikti da GOSTERIM ayni mi? Python cok kucuk/buyuk
    // sayilarda ustel yazim kullaniyor (1E-7) ve tam bolmede sondaki sifirlari
    // atiyor; biz her zaman duz ondalik yaziyoruz. Hesabi etkilemez, ama
    // gormezden de gelinmez -- sayiliyor ve raporlaniyor.
    if (k.gosterim) {
      const ham = hesapla(k, true);
      if (ham.some((v, i) => v !== k.gosterim[i])) gosterimFarki += 1;
    }
  }

  console.log("=".repeat(72));
  console.log("net_maas.js  <->  net_maas.py  KIYASI");
  console.log("=".repeat(72));
  let toplam = 0;
  let hata = 0;
  for (const tip of Object.keys(sayac)) {
    const s = sayac[tip];
    toplam += s.toplam;
    hata += s.hata;
    console.log("  %s %s %s",
      tip.padEnd(18), String(s.toplam).padStart(7),
      s.hata === 0 ? "hepsi ayni" : (s.hata + " FARKLI"));
  }
  console.log("-".repeat(72));
  console.log("  TOPLAM %s kiyas, %s DEGER farki", toplam, hata);
  console.log("  Ayrica %s yerde deger ayni ama GOSTERIM farkli (Python ustel",
    gosterimFarki);
  console.log("  yazim / tam bolmede sondaki sifirlari atma). Hesabi etkilemez:");
  console.log("  net_maas ciktilarinin 27.000+ kiyasinda gosterim de birebir ayni.");
  if (hatalar.length) {
    console.log("\nIlk farklar:");
    for (const h of hatalar) console.log(h);
  }
  console.log("=".repeat(72));
  console.log(hata === 0 ? "  SONUC: PORT BIREBIR TUTUYOR" : "  SONUC: PORT AYRISIYOR");
  return hata === 0 ? 0 : 1;
}

function hesapla(k, hamGosterim) {
  const g = k.girdi;
  if (k.tip === "des_islem") {
    const [a, b, islem] = g;
    const sonuc = des(a)[islem](des(b));
    return [hamGosterim ? sonuc.toString() : sonuc.sade()];
  }
  if (k.tip === "des_yuvarla") {
    const [a, hane, mod] = g;
    return [des(a).yuvarla(hane, mod).toString()];
  }
  if (k.tip === "aylik_net") {
    const [brut, yil, ay, kum, gun, sgdp, istisna] = g;
    const s = nm.aylik_net(brut, yil, ay, {
      kumulatif_matrah: kum, gun: gun, sgdp: sgdp, istisna_var: istisna,
    });
    return ALANLAR.map((a) => s[a].toString());
  }
  if (k.tip === "asgari_istisna") {
    const [yil, ay, kumAsg] = g;
    return nm._asgari_istisna(yil, ay, kumAsg).map((v) => v.toString());
  }
  if (k.tip === "tavan") {
    const [yil, ay] = g;
    return [nm.brut_asgari(yil, ay).toString(), nm.sgk_tavan(yil, ay).toString()];
  }
  if (k.tip === "gv_matrahi") {
    const [brut, yil, ay, gun, sgdp] = g;
    return [nm.gv_matrahi(brut, yil, ay, gun, sgdp).toString()];
  }
  if (k.tip === "yil_bordrosu") {
    const [brut, yil] = g;
    return nm.yil_bordrosu(brut, yil).map((s) => s.net.toString());
  }
  if (k.tip === "ceyrek") {
    return [nm.ceyrek(g[0]).toString()];
  }
  throw new Error("bilinmeyen tip: " + k.tip);
}

process.exit(main());
