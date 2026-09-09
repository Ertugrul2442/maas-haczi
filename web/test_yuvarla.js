// yuvarla.js'i sinar. Python gerektirmez, agdan bagimsiz.
//
//     node web/test_yuvarla.js
//
// Beklenen degerler 09.09.2026'da Python'un kendisine urettirildi
// (py -3.13, round(x, 2)) ve buraya gomuldu. Yani bu test "JS kendi kendine
// tutarli mi" degil, "JS Python ile AYNI kurusu veriyor mu" diye soruyor.

"use strict";

const { yuvarla2, ceyrekAsagi } = require("./yuvarla.js");

let gecen = 0;
let kalan = 0;

function onay(baslik, cikan, beklenen) {
  if (Object.is(cikan, beklenen)) {
    gecen++;
  } else {
    kalan++;
    console.log("  KALDI  %s\n         beklenen %s, cikan %s", baslik, beklenen, cikan);
  }
}

console.log("=".repeat(72));
console.log("1) GERCEK KARARDAKI 9 KALEM  (test_hesap.py ile ayni rakamlar)");
console.log("=".repeat(72));
// [ceyrek, gun, Python'un verdigi tutar]
const KALEMLER = [
  [5526.17, 5, 921.03],
  [5526.17, 30, 5526.17],
  [7018.87, 30, 7018.87],
  [7018.87, 30, 7018.87],
  [7018.87, 15, 3509.43], // <<< KRITIK SATIR: Math.round burada 3509.44 der
  [7018.87, 15, 3509.43],
  [7018.87, 17, 3977.36],
  [7018.87, 14, 3275.47],
  [7018.87, 13, 3041.51],
];
for (const [ceyrek, gun, beklenen] of KALEMLER) {
  onay(`${ceyrek}/30*${gun}`, yuvarla2((ceyrek / 30) * gun), beklenen);
}
console.log("  (9 kalemin toplami kagitta 37.798,14 TL)");
const toplam = yuvarla2(KALEMLER.reduce((t, [c, g]) => t + yuvarla2((c / 30) * g), 0));
onay("dokuz kalemin TOPLAMI", toplam, 37798.14);

console.log("");
console.log("=".repeat(72));
console.log("2) TAM YARIM TUZAGI -- ikili olarak tam temsil edilen degerler");
console.log("=".repeat(72));
console.log("  Python cifte yuvarlar, JS'in hazir yuvarlamalari yukari kacar.");
// Python: round(v, 2)
const TAM_YARIM = [
  [0.125, 0.12], [0.375, 0.38], [0.625, 0.62], [0.875, 0.88],
  [1.125, 1.12], [1.375, 1.38], [1.625, 1.62], [1.875, 1.88],
  [2.625, 2.62], [3.125, 3.12], [10.625, 10.62], [100.125, 100.12],
];
for (const [v, beklenen] of TAM_YARIM) {
  onay(`round(${v}, 2)`, yuvarla2(v), beklenen);
}

console.log("");
console.log("=".repeat(72));
console.log("3) FLOAT TEMSIL TUZAGI -- 'yarim gibi gorunen' ama olmayan degerler");
console.log("=".repeat(72));
// Bunlar ondalik yazimda .xx5 ile bitiyor ama float'ta bir tik ALTINDA
// kaliyorlar; Python asagi yuvarliyor.
const YALANCI_YARIM = [
  [2.675, 2.67], [1.005, 1.0], [0.145, 0.14], [8.475, 8.47], [1.115, 1.11],
];
for (const [v, beklenen] of YALANCI_YARIM) {
  onay(`round(${v}, 2)`, yuvarla2(v), beklenen);
}

console.log("");
console.log("=".repeat(72));
console.log("4) 1/4 ASAGI KIRPMA (IIK 83 ust siniri asilmasin)");
console.log("=".repeat(72));
onay("28.075,50 / 4  (2026 -- daire de boyle yazmis)", ceyrekAsagi(28075.5), 7018.87);
onay("22.104,67 / 4  (kanun formulunun verdigi)", ceyrekAsagi(22104.67), 5526.16);
onay("100,00 / 4", ceyrekAsagi(100), 25);
onay("0,03 / 4  (asagi kirpma sifira iner)", ceyrekAsagi(0.03), 0);

console.log("");
console.log("=".repeat(72));
console.log("5) ISARET VE UC DURUMLAR");
console.log("=".repeat(72));
onay("negatif: -3509.435", yuvarla2(-3509.435), -3509.43);
onay("sifir", yuvarla2(0), 0);
onay("zaten iki haneli: 12.34", yuvarla2(12.34), 12.34);
onay("tam sayi: 5526", yuvarla2(5526), 5526);
onay("buyuk: 1234567.891", yuvarla2(1234567.891), 1234567.89);

console.log("");
console.log("=".repeat(72));
console.log(">>> %d GECTI, %d KALDI", gecen, kalan);
console.log("=".repeat(72));
if (kalan) {
  console.log("Yuvarlama bozuk -- web surumunun hesabi masaustuyle TUTMAZ.");
}
process.exit(kalan === 0 ? 0 : 1);
