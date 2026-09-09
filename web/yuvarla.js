// Python'un round(x, 2)'sinin BIREBIR taklidi.
//
// ⚠ BU DOSYA WEB SURUMUNUN TEMEL TASI. Yanlisi kurus kaydirir ve kimse
// fark etmez -- tam da bu projenin en korktugu hata turu.
//
// NEDEN GEREKLI (09.09.2026'da olculdu, tahmin degil):
// Masaustu surum tutarlari Python'un round(float, 2)'siyle hesapliyor ve
// gercek mahkeme karariyla birebir tutuyor. JS'in hazir yuvarlamalari bunu
// KARSILAMIYOR -- 47.310 gercekci (ceyrek, gun) kombinasyonu tarandi:
//
//     Math.round(x*100)/100      864 yerde farkli
//     parseFloat(x.toFixed(2))    60 yerde farkli
//     bu dosyadaki yuvarla2()      0 yerde farkli
//
// Daha kotusu, Math.round karardaki GERCEK dosyada da yaniliyor:
// 7018.87/30*15 icin 3509.44 diyor, dogrusu 3509.43 (kagitta da oyle).
// CLAUDE.md tuzak 1 bu satiri "kritik" diye isaretlemis.
//
// SEBEP: Python float.__round__ "dogru yuvarlama" yapar -- float'in GERCEK
// ikili degerine en yakin 2 ondalikli sayiyi secer, tam ortada kalirsa CIFT
// olani alir (banker's rounding). JS'in Math.round'u ve toFixed'i half-up.
// Ayrisma iki yerde:
//   1. 3509.435 gibi degerler float'ta aslinda 3509.43499... -- Math.round
//      x*100 carpimindan sonra yukari kaciyor, Python kacmiyor.
//   2. 0.125 gibi ikili olarak TAM temsil edilen degerlerde gercekten yarim
//      durumu olusuyor; Python 0.12 (cifte), JS 0.13 (yukari) diyor.
//      x/8 formundaki 4.000 degerin 1.000'inde ayrisiyorlar.
//
// YONTEM: toFixed(20) ile yeterince uzun ondalik gosterim alinip 2. haneden
// sonrasi STRING olarak kiyaslaniyor; tam yarim ise cifte yuvarlaniyor.

"use strict";

function yuvarla2(x) {
  if (!isFinite(x)) return x;
  const eksi = x < 0;
  const a = Math.abs(x);
  const s = a.toFixed(20);
  const nokta = s.indexOf(".");
  const tam = s.slice(0, nokta);
  const kesir = s.slice(nokta + 1);
  const ilkIki = kesir.slice(0, 2).padEnd(2, "0");
  const geri = kesir.slice(2);

  let taban = BigInt(tam) * 100n + BigInt(ilkIki);
  let yukari;
  if (geri.length === 0) {
    yukari = false;
  } else {
    const yarim = "5" + "0".repeat(geri.length - 1);
    if (geri > yarim) yukari = true;
    else if (geri < yarim) yukari = false;
    else yukari = taban % 2n === 1n; // tam yarim -> cifte yuvarla
  }
  if (yukari) taban += 1n;
  const sonuc = Number(taban) / 100;
  return eksi ? -sonuc : sonuc;
}

// 1/4'un ASAGI kirpilmasi (IIK 83 ust sinir -- asilmasin).
// Python tarafinda net_maas.ceyrek(): Decimal(net)/4, ROUND_DOWN.
// Burada kurusa cevirip tam sayi bolmesi yapiliyor; float hatasina karsi
// once yuvarla2 ile kurusa oturtuluyor.
function ceyrekAsagi(net) {
  const kurus = Math.round(yuvarla2(net) * 100);
  return Math.floor(kurus / 4) / 100;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { yuvarla2, ceyrekAsagi };
}
