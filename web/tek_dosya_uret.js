// web/index.html + 9 parca -> TEK BIR .html dosyasi  (flasa tek basina gider)
//
// NEDEN VAR: 11.09.2026'da adliyede yasandi. Flasa sadece index.html
// kopyalanmis, yanindaki lib/ ve 7 .js dosyasi gitmemisti. Sayfa acildi ama
// kirmizi kutuda "Program eksik yuklendi -- hesap yapilamaz" dedi (yukleme
// kontrolu tasarlandigi gibi calisti, sessiz kalmadi). Ayni gun
// ertugrul2442.github.io da adliyede acilmadi -- ag engelliyor olabilir.
// "Klasorun tamamini kopyala" demek dogru ama kirilgan: insan tek dosyayi
// kopyalar. Cozum: butun parcalar sayfanin ICINE gomulur, tek dosya kalir.
//
//     node web/tek_dosya_uret.js            -> dagitim/Maas Haczi.html
//     node web/tek_dosya_uret.js <hedef>    -> verilen yola yazar
//
// web/index.html TEK KAYNAK olarak kaliyor (gelistirme, testler, GitHub
// Pages onu kullaniyor). Bu dosya ondan URETILIYOR; elle degistirilmez.
// Ayrisma riskine karsi CI tek dosyayi uretip BOS BIR KLASORDE arayuz
// kiyasina sokuyor: yaninda hicbir .js yokken masaustuyle ayni sonucu
// vermek zorunda. (web/ altinda sinansa, gomulmemis bir <script src> komsu
// dosyadan sessizce yuklenir ve kiyas yalandan yesil yanardi.)
//
// ⚠ GOMME TUZAGI: <script> icine gomulen metinde "</script" gecerse sayfa
// orada kesilir. "<!--" ve "<script" AYNI blokta gecerse de HTML ayristirici
// "cift kacisli" duruma girip kapanis etiketini gormeyebilir. 11.09.2026'da
// sayildi: xlsx.full.min.js'te 4 "<!--" var, desimal.js ve dokum_oku.js'te
// birer "<script" (yorumlarda) -- hicbiri ayni blokta degil, yani zararsiz.
// Metni kor bir "kacis" ile degistirmek YERINE burada kontrol edilip
// DURULUYOR: "\s" gibi bir kacis duzenli ifadede anlam degistirir, hesabi
// sessizce bozabilirdi.

"use strict";

const fs = require("fs");
const path = require("path");

const WEB = __dirname;
const KAYNAK_SAYFA = path.join(WEB, "index.html");
const VARSAYILAN_HEDEF = path.join(WEB, "..", "dagitim", "Maas Haczi.html");

const SCRIPT_SRC = /<script src="([^"]+)"><\/script>/g;

const BASLIK = `
<!--
  URETILEN DOSYA -- ELLE DEGISTIRME.
  Kaynak: web/index.html ve onun yukledigi 9 parca (lib/ dahil).
  Uretmek icin:  node web/tek_dosya_uret.js
  Bu dosya TEK BASINA calisir: yanina hicbir sey kopyalamak gerekmez,
  internet gerekmez. Cift tikla, tarayicida (Chrome/Edge) acilir.
-->`;

function dur(mesaj) {
  console.log("HATA: " + mesaj);
  console.log("      Tek dosya URETILMEDI.");
  process.exit(1);
}

function gommeGuvenliMi(ad, metin) {
  if (/<\/script/i.test(metin)) {
    dur(ad + " icinde '</script' geciyor; gomulurse sayfa orada kesilir.");
  }
  if (metin.indexOf("<!--") >= 0 && /<script/i.test(metin)) {
    dur(ad + " icinde hem '<!--' hem '<script' geciyor; HTML ayristirici "
      + "kapanis etiketini gormeyebilir.");
  }
}

// ayarlar_veri.js, ayarlar.json'un URETILEN kopyasi. Bayatsa tek dosya da
// eski asgari ucretle hesaplar -- sessizce. Once onu dogrula.
function ayarlarTazeMi() {
  const kok = JSON.parse(fs.readFileSync(path.join(WEB, "..", "ayarlar.json"), "utf8"));
  const kopya = require(path.join(WEB, "ayarlar_veri.js"));
  if (JSON.stringify(kok) !== JSON.stringify(kopya)) {
    dur("web/ayarlar_veri.js, ayarlar.json ile AYRISMIS. Once:  "
      + "node web/ayarlar_uret.js");
  }
}

function main() {
  const hedef = path.resolve(process.argv[2] || VARSAYILAN_HEDEF);
  ayarlarTazeMi();

  let sayfa = fs.readFileSync(KAYNAK_SAYFA, "utf8");
  const gomulen = [];

  // Yerine koyma FONKSIYONLA yapiliyor, metinle degil: String.replace'e metin
  // verilirse icindeki "$&", "$1" gibi diziler ozel anlam kazanir ve kucultulmus
  // kutuphanelerde bunlar geciyor -- kod sessizce bozulurdu.
  sayfa = sayfa.replace(SCRIPT_SRC, (_, ad) => {
    const yol = path.join(WEB, ad);
    if (!fs.existsSync(yol)) dur(ad + " bulunamadi (index.html onu istiyor).");
    let metin = fs.readFileSync(yol, "utf8");
    if (metin.charCodeAt(0) === 0xfeff) metin = metin.slice(1);
    gommeGuvenliMi(ad, metin);
    gomulen.push([ad, Buffer.byteLength(metin, "utf8")]);
    return "<script>/* ---- gomulu: " + ad + " ---- */\n" + metin + "\n</script>";
  });

  if (!gomulen.length) dur("index.html'de hic <script src> bulunamadi.");
  if (/<script[^>]*\bsrc\s*=/i.test(sayfa)) {
    dur("gomulemeyen bir <script src> kaldi; tek dosya disariya bagimli olurdu.");
  }

  const charset = '<meta charset="utf-8">';
  if (sayfa.indexOf(charset) < 0) dur("index.html'de " + charset + " yok.");
  sayfa = sayfa.replace(charset, () => charset + BASLIK);

  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, sayfa, "utf8");

  console.log("yazildi: " + hedef);
  console.log("  " + gomulen.length + " parca gomuldu, toplam "
    + Buffer.byteLength(sayfa, "utf8").toLocaleString("tr-TR") + " bayt:");
  for (const [ad, bayt] of gomulen) {
    console.log("    " + ad.padEnd(22) + bayt.toLocaleString("tr-TR").padStart(10) + " bayt");
  }
  return 0;
}

main();
