// web/kiyas_dokum.py'nin urettigi JSON'u okur, AYNI .xls dosyalarini SheetJS
// ile okuyup xlrd'nin sonucuyla alan alan kiyaslar.
//
//     py -3.13 web/kiyas_dokum.py > web/kiyas_dokum_veri.json
//     node web/kiyas_dokum.js web/kiyas_dokum_veri.json
//
// Kiyas SADECE kayit sayisina bakmaz: her kaydin 10 alani, kisi adi, uyari
// metinlerinin TAMAMI ve hata mesajlari harfi harfine kiyaslanir. Sebep bu
// projede uc kez yasanan "sayi dogru, metin yanlis" hatasi.

"use strict";

const fs = require("fs");
const path = require("path");
const DokumOku = require("./dokum_oku.js");

const KAYIT_ALAN = ["kol", "isyeri", "yil", "ay", "gun", "giris", "cikis",
  "eksik_neden", "ad", "pek"];

const veri = JSON.parse(fs.readFileSync(process.argv[2]
  || path.join(__dirname, "kiyas_dokum_veri.json"), "utf8"));

let kiyas = 0;
let fark = 0;
const ornekler = [];

function esit(yol, a, b) {
  kiyas += 1;
  // Sayilar: JSON'dan gelen float ile JS'in urettigi float birebir esit
  // olmali. Yuvarlama YOK -- burada okuma kiyaslaniyor, hesap degil.
  const ayni = (typeof a === "number" && typeof b === "number")
    ? (a === b || (isNaN(a) && isNaN(b)))
    : String(a) === String(b);
  if (!ayni) {
    fark += 1;
    if (ornekler.length < 25) {
      ornekler.push(yol + "\n      python: " + JSON.stringify(a)
        + "\n      js    : " + JSON.stringify(b));
    }
  }
}

for (const durum of veri.durumlar) {
  const etiket = durum.ad;
  const bek = durum.beklenen;

  let cikan;
  try {
    const bayt = fs.readFileSync(durum.dosya);
    cikan = DokumOku.dokum_oku(bayt);
  } catch (e) {
    cikan = { hata: e.message };
  }

  // Hata durumu: iki taraf da ayni sekilde patlamali. Birinin patlayip
  // digerinin sessizce sonuc uretmesi en tehlikeli ayrisma.
  esit(etiket + " > hata var mi", Boolean(bek.hata), Boolean(cikan.hata));
  if (bek.hata || cikan.hata) {
    esit(etiket + " > hata metni", bek.hata || "(yok)", cikan.hata || "(yok)");
    continue;
  }

  esit(etiket + " > kisi adi", bek.ad, cikan.ad);
  esit(etiket + " > kayit sayisi", bek.kayitlar.length, cikan.kayitlar.length);
  esit(etiket + " > uyari sayisi", bek.uyarilar.length, cikan.uyarilar.length);

  const u = Math.max(bek.uyarilar.length, cikan.uyarilar.length);
  for (let i = 0; i < u; i++) {
    esit(etiket + " > uyari[" + i + "]",
      bek.uyarilar[i] === undefined ? "(yok)" : bek.uyarilar[i],
      cikan.uyarilar[i] === undefined ? "(yok)" : cikan.uyarilar[i]);
  }

  const n = Math.min(bek.kayitlar.length, cikan.kayitlar.length);
  for (let i = 0; i < n; i++) {
    for (const alan of KAYIT_ALAN) {
      esit(etiket + " > kayit[" + i + "]." + alan,
        bek.kayitlar[i][alan], cikan.kayitlar[i][alan]);
    }
  }
}

console.log("=".repeat(72));
console.log("DOKUM OKUMA KIYASI  --  xlrd (Python)  vs  SheetJS (tarayici)");
console.log("=".repeat(72));
console.log("  durum : " + veri.durumlar.length);
console.log("  kiyas : " + kiyas);
console.log("  fark  : " + fark);
if (ornekler.length) {
  console.log("");
  console.log("Ilk farklar:");
  for (const o of ornekler) console.log("  - " + o);
}
console.log("");
console.log(fark === 0
  ? ">>> IKI KUTUPHANE BIREBIR AYNI OKUYOR."
  : ">>> AYRISMA VAR -- web surumu masaustunden FARKLI hesaplar.");
process.exit(fark === 0 ? 0 : 1);
