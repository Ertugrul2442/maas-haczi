// ayarlar.json -> web/ayarlar_veri.js  (uretici VE bekci)
//
// NEDEN VAR: tarayici "file://" ile acilan sayfada fetch/XHR'i ENGELLIYOR.
// 10.09.2026'da olculdu (Chromium, playwright):
//     fetch("ayarlar.json") -> "Failed to fetch"
//     XHR   ayni dosya      -> "Failed to load"
// Bu program adliyede FLASTAN acilabilmeli (masaustu surumun exe'si zaten
// oyle dagitiliyor), yani ayarlari ag uzerinden okumak bir secenek degil.
// Cozum: ayarlar.json'un birebir kopyasi bir <script src> dosyasina gomulur.
//
// AMA iki kopya demek, ikisinin sessizce ayrisabilecegi demek -- bu projenin
// en pahali hata sinifi tam da bu. O yuzden bu dosya iki is yapiyor:
//
//     node web/ayarlar_uret.js            -> uretir (ayarlar_veri.js'i yazar)
//     node web/ayarlar_uret.js --kontrol  -> KIYASLAR, farkliysa cikis 1
//
// Ikincisi CI'da kosuyor. Yani ayarlar.json degisip web kopyasi guncellenmezse
// (ornegin yillik veri_cek.py yeni asgari ucreti yazdiginda) yapi KIRILIR;
// kimse "web surumu hala 2026 rakamiyla hesapliyor" durumunu fark etmeden
// gecemez.

"use strict";

const fs = require("fs");
const path = require("path");

const KAYNAK = path.join(__dirname, "..", "ayarlar.json");
const HEDEF = path.join(__dirname, "ayarlar_veri.js");

const BASLIK = `// URETILEN DOSYA -- ELLE DEGISTIRME.
//
// Kaynak: ayarlar.json (depo kokunde). Bu dosya onun birebir kopyasidir ve
//     node web/ayarlar_uret.js
// ile yeniden uretilir. Yeni yilin asgari ucretini ayarlar.json'a ekle,
// sonra bu komutu calistir.
//
// Neden kopya var: "file://" ile acilan sayfada tarayici fetch'i engelliyor
// (olculdu), yani flastan acilan surum ayarlar.json'u okuyamaz. Ayrinti:
// web/ayarlar_uret.js basindaki yorum.
//
// Iki kopyanin ayrisip ayrismadigini CI her itiste olcuyor:
//     node web/ayarlar_uret.js --kontrol
`;

function govde(metin) {
  // ayarlar.json'u once cozup sonra yeniden yaziyoruz ki bicim farki
  // (bosluk, satir sonu) kiyasi yaniltmasin -- kiyaslanan sey ICERIK.
  const veri = JSON.parse(metin);
  return BASLIK + `
(function (kok) {
  "use strict";
  const veri = ${JSON.stringify(veri, null, 2).split("\n").join("\n  ")};
  if (typeof module !== "undefined" && module.exports) module.exports = veri;
  else kok.AYARLAR_VERI = veri;
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
}

function main() {
  const kaynak = fs.readFileSync(KAYNAK, "utf8");
  const beklenen = govde(kaynak);
  const kontrol = process.argv.indexOf("--kontrol") >= 0;

  if (!kontrol) {
    fs.writeFileSync(HEDEF, beklenen, "utf8");
    const n = JSON.parse(kaynak).donemler.length;
    console.log("yazildi: web/ayarlar_veri.js  (" + n + " donem)");
    return 0;
  }

  let simdiki = null;
  try {
    simdiki = fs.readFileSync(HEDEF, "utf8");
  } catch (e) {
    console.log("HATA: web/ayarlar_veri.js YOK. Uret:  node web/ayarlar_uret.js");
    return 1;
  }
  if (simdiki === beklenen) {
    // Sadece metin degil, gercekten yuklenip ayni veriyi verdigini de gor.
    const yuklenen = require(HEDEF);
    const ayni = JSON.stringify(yuklenen) === JSON.stringify(JSON.parse(kaynak));
    if (!ayni) {
      console.log("HATA: dosya ayni gorunuyor ama yuklenince farkli veri veriyor.");
      return 1;
    }
    console.log("TAMAM  ayarlar.json ile web/ayarlar_veri.js ayni "
      + "(" + JSON.parse(kaynak).donemler.length + " donem).");
    return 0;
  }

  console.log("HATA: ayarlar.json ile web/ayarlar_veri.js AYRISMIS.");
  console.log("      Web surumu eski asgari ucret tablosuyla hesap yapardi.");
  console.log("      Duzeltmek icin:  node web/ayarlar_uret.js");
  return 1;
}

process.exit(main());
