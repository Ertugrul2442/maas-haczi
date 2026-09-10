// "Node'da calisiyor" ile "tarayicida calisiyor" AYRI sorulardir.
//
// Bu dosya ikincisini olcer: require ve module'un OLMADIGI bos bir baglam
// kurup web/*.js dosyalarini klasik <script src> gibi sirayla calistirir,
// sonra hesabin gercekten yapilabildigini kontrol eder.
//
// NEDEN GEREKLI: modulleri Node aliskanligiyla `require` ile yazmak kolay ve
// testler gecer; ama tarayicida ilk satirda "require is not defined" ile
// olur ve bu ancak sayfa acildiginda gorulur. Ayrica ES modul (import/export)
// BILEREK kullanilmadi -- "file://" ile acilan sayfada tarayici ES modulu
// engelliyor, bu program ise flastan/yerel dosyadan da acilabilmeli.
//
//     node web/tarayici_kontrol.js

"use strict";

const vm = require("vm");
const fs = require("fs");
const path = require("path");

const DOSYALAR = ["desimal.js", "yuvarla.js", "net_maas.js", "hesap.js"];
const klasor = __dirname;

let gecen = 0;
let kalan = 0;

function onay(baslik, cikan, beklenen) {
  if (String(cikan) === String(beklenen)) {
    gecen += 1;
    console.log("  TAMAM  " + baslik + "  ->  " + cikan);
  } else {
    kalan += 1;
    console.log("  HATA   " + baslik + "  ->  " + cikan + "   beklenen: " + beklenen);
  }
}

console.log("=".repeat(72));
console.log("TARAYICI TAKLIDI - require/module olmadan yukleme");
console.log("=".repeat(72));

// Tarayicidaki gibi: sadece console var, modul sistemi YOK.
const baglam = vm.createContext({ console: console });

for (const d of DOSYALAR) {
  try {
    vm.runInContext(fs.readFileSync(path.join(klasor, d), "utf8"), baglam, { filename: d });
    gecen += 1;
    console.log("  TAMAM  " + d + " yuklendi");
  } catch (e) {
    kalan += 1;
    console.log("  HATA   " + d + " yuklenemedi: " + e.message);
  }
}

const olc = (kod) => vm.runInContext(kod, baglam);

// Tarayicida ayarlar.json fetch ile gelir; burada dosyadan okuyup dogrudan
// koda gomuyoruz -- baglama kuresel degisken birakmamak icin.
const AYAR_METIN = fs.readFileSync(path.join(klasor, "..", "ayarlar.json"), "utf8");

onay("baglamda require/module yok",
  olc("(typeof require === 'undefined') && (typeof module === 'undefined')"), "true");

// Kuresel isim kirliligi: sadece uc ad birakilmali, yardimci fonksiyonlar degil.
onay("birakilan kuresel adlar",
  olc("Object.keys(this).filter(a => a !== 'console').sort().join(',')"),
  "Desimal,Hesap,NetMaas,Yuvarla");

onay("2026 net asgari ucret",
  olc("NetMaas.aylik_net('33030.00', 2026, 1, {kumulatif_matrah: 0}).net.toString()"),
  "28075.50");

onay("2026 1/4 (tutanaktaki rakam)",
  olc("NetMaas.ceyrek('28075.50').toString()"), "7018.87");

// Karardaki gercek dosyanin kritik satiri. Math.round burada 3509.44 der.
onay("yuvarla2(7018.87/30*15)", olc("Yuvarla.yuvarla2(7018.87/30*15)"), "3509.43");

onay("ondalik motoru: 0.1+0.2", olc("Desimal.des('0.1').topla('0.2').toString()"), "0.3");

// Hesap motoru. Iki ayli bilerek: Ocak TEBLIG AYI oldugu icin tam ay degil,
// tebligden sonraki 29 gun sayiliyor (6.784,91); Subat tam ay (7.018,87).
// Yani bu tek kontrol hem 1/4'u hem teblig ayi kuralini sinamis oluyor.
// Beklenen rakamlar Python'a urettirildi, elle yazilmadi.
onay("hesap motoru (teblig ayi + tam ay)", olc(`
  (function () {
    var a = Hesap.Ayarlar.kur(${JSON.stringify(AYAR_METIN)});
    var ay = function (n) {
      return {kol:"4a", isyeri:"900001", yil:2026, ay:n, gun:30,
              giris:"", cikis:"", eksik_neden:"", ad:"ORNEK", pek:33030.00};
    };
    var s = Hesap.hesapla([ay(1), ay(2)], "900001", {yil:2026,ay:1,gun:1},
                          {yil:2026,ay:3,gun:28}, 0, a, "ORNEK", "cevap-yok");
    return Hesap.tl(s.kalemler[0].tutar) + " + " + Hesap.tl(s.kalemler[1].tutar)
      + " = " + Hesap.tl(s.toplam);
  })()`), "6.784,91 + 7.018,87 = 13.803,78");

onay("Turkce ek (unlusuz ad cokmuyor)", olc("Hesap.ek_yonelme('MKS')"), "MKS'e");

console.log("");
console.log("=".repeat(72));
console.log(">>> " + gecen + " GECTI, " + kalan + " KALDI");
console.log("=".repeat(72));
if (kalan) {
  console.log("Tarayicida yuklenmiyor -- web surumu acilmaz.");
}
process.exit(kalan === 0 ? 0 : 1);
