// test_net_maas.py'nin portu -- net_maas.js dogrulamasi.
//
// Kendi kendini tebrik etmiyor; disaridan gelen, resmi olarak yayimlanmis
// rakamlara karsi olcuyor. Olcutlerin gerekcesi test_net_maas.py'de yazili.
//
// ⚠ CIKTI, Python testinin ciktisiyla BIREBIR AYNI olacak sekilde
// bicimlendirildi. Sebep: iki surumun ayni sonucu verdigini "herhalde tutuyor"
// diye degil, dosya kiyasiyla gostermek icin:
//     py -3.13 test_net_maas.py > a.txt
//     node web/test_net_maas.js  > b.txt
//     diff a.txt b.txt        (fark cikmamali)
//
// Bu dosya Python GEREKTIRMEZ, tarayici surumunun kendi guvencesi budur.
//     node web/test_net_maas.js

"use strict";

const { des } = require("./desimal.js");
const { ASGARI_BRUT, brut_asgari, aylik_net, yil_bordrosu, _asgari_istisna, ceyrek }
  = require("./net_maas.js");

// Resmi olarak yayimlanmis NET asgari ucretler (donem basi -> net)
const NET_ASGARI = {
  "2022-01": "4253.40", "2022-07": "5500.35",
  "2023-01": "8506.80", "2023-07": "11402.32",
  "2024-01": "17002.12",
  "2025-01": "22104.67",
  "2026-01": "28075.50",
};

// 2026 asgari ucret istisna tutarlari (bagimsiz kaynaklardan)
const ISTISNA_2026 = { 1: "4211.33", 6: "4211.33", 7: "4537.75", 8: "5615.10", 12: "5615.10" };
const DAMGA_ISTISNA_2026 = "250.70";

const CIZGI = "=".repeat(72);

function sol(metin, n) {
  const t = String(metin);
  return t.length >= n ? t : t + " ".repeat(n - t.length);
}

function sag(metin, n) {
  const t = String(metin);
  return t.length >= n ? t : " ".repeat(n - t.length) + t;
}

function binlik(n) {
  return String(n).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
}

function _iki(n) {
  return (n < 10 ? "0" : "") + n;
}

function _donem_anahtari(yil, ay) {
  const an = yil + "-" + _iki(ay);
  let sec = null;
  for (const [bas] of ASGARI_BRUT) {
    if (bas <= an) sec = bas;
  }
  return sec;
}

function olcut1() {
  console.log(CIZGI);
  console.log("OLCUT 1 - Asgari ucret: 60 ayin hepsi resmi net rakamini veriyor mu?");
  console.log(CIZGI);
  let gecen = 0;
  let toplam = 0;
  for (const yil of [2022, 2023, 2024, 2025, 2026]) {
    // asgari ucret yil ortasinda degisebildigi icin ay ay kurulur
    let kum = des(0);
    let kum_asg = des(0);
    const hatali = [];
    for (let ay = 1; ay <= 12; ay++) {
      const ba = brut_asgari(yil, ay);
      const s = aylik_net(ba, yil, ay, { kumulatif_matrah: kum, kumulatif_asgari: kum_asg });
      const bekle = des(NET_ASGARI[_donem_anahtari(yil, ay)]);
      toplam += 1;
      if (s.net.esit(bekle)) gecen += 1;
      else hatali.push("    ay " + sag(ay, 2) + ": " + s.net + "  !=  beklenen " + bekle);
      kum = s.kumulatif;
      kum_asg = kum_asg.topla(_asgari_istisna(yil, ay, kum_asg)[1]);
    }
    console.log("  " + yil + " : " + (hatali.length === 0 ? "12/12 TAMAM" : "HATA"));
    for (const h of hatali) console.log(h);
  }
  console.log("  --> " + gecen + "/" + toplam + " ay");
  return gecen === toplam;
}

function olcut2() {
  console.log("");
  console.log(CIZGI);
  console.log("OLCUT 2/3 - 2026 asgari ucret istisna tutarlari (GV ve damga)");
  console.log(CIZGI);
  console.log("  " + sol("Ay", 4) + " " + sol("GV istisnasi", 14) + " "
    + sol("DV istisnasi", 14) + " " + "kontrol");
  let kum_asg = des(0);
  let ok = true;
  for (let ay = 1; ay <= 12; ay++) {
    const [gv, m, dv] = _asgari_istisna(2026, ay, kum_asg);
    let not_ = "";
    if (ay in ISTISNA_2026) {
      const bekle = des(ISTISNA_2026[ay]);
      const iyi = gv.esit(bekle);
      ok = ok && iyi;
      not_ = "beklenen " + bekle + "  " + (iyi ? "TAMAM" : "HATA");
    }
    if (!dv.esit(des(DAMGA_ISTISNA_2026))) {
      ok = false;
      not_ += "  DAMGA HATA (" + dv + ")";
    }
    console.log("  " + sol(ay, 4) + " " + sol(gv, 14) + " " + sol(dv, 14) + " " + not_);
    kum_asg = kum_asg.topla(m);
  }
  return ok;
}

function olcut4() {
  console.log("");
  console.log(CIZGI);
  console.log("OLCUT 4 - 'brut x 0,85' kestirmesi asgari ucret USTUNDE ne kadar sapiyor?");
  console.log(CIZGI);
  for (const brut of [40000, 65000, 120000]) {
    const sat = yil_bordrosu(brut, 2026);
    const kestirme = des(brut).carp(des("0.85"));
    const ocak = sat[0].net;
    const aralik = sat[sat.length - 1].net;
    console.log("  Brut " + binlik(brut) + " TL/ay:");
    console.log("    Ocak neti    " + sag(ocak, 12) + "   1/4 = " + sag(ceyrek(ocak), 10));
    console.log("    Aralik neti  " + sag(aralik, 12) + "   1/4 = " + sag(ceyrek(aralik), 10));
    console.log("    x0,85        " + sag(kestirme, 12) + "   1/4 = " + sag(ceyrek(kestirme), 10)
      + "   <-- Ocak'ta " + kestirme.cikar(ocak) + " TL, Aralik'ta "
      + kestirme.cikar(aralik) + " TL FAZLA");
  }
  return true;
}

function olcut5() {
  console.log("");
  console.log(CIZGI);
  console.log("OLCUT 5 - Asgari ucretlide 'brut x 0,85' NEDEN tutuyor?");
  console.log(CIZGI);
  for (const [bas, br] of ASGARI_BRUT) {
    const yil = parseInt(bas.slice(0, 4), 10);
    const ay = parseInt(bas.slice(5), 10);
    if (yil < 2022) {
      console.log("  " + bas + "  brut " + sol(br, 10) + "  ->  0,85 kurali GECERSIZ (AGI donemi)");
      continue;
    }
    const s = aylik_net(des(br), yil, ay, { kumulatif_matrah: 0 });
    const yak = des(br).carp(des("0.85")).yuvarla(2, "HALF_EVEN");
    console.log("  " + bas + "  brut " + sol(br, 10) + "  net " + sol(s.net, 11)
      + "  x0,85 = " + sol(yak, 11) + "  fark " + s.net.cikar(yak));
  }
  console.log("  Sebep: istisna geliri vergiyi ve damgayi TAM siliyor, geriye sadece");
  console.log("  %14 SGK + %1 issizlik = %15 kesinti kaliyor. 1 - 0,15 = 0,85.");
  return true;
}

function olcut6() {
  // ceyrek() gercekten 4'e boluyor mu, ve daireyle tutuyor mu?
  // Bu test bosuna degil: Python tarafinda ilk yazimda ceyrek() 4'e BOLMEYI
  // unutmus, sadece kirpiyordu ve ciktida net'in kendisi '1/4' diye
  // gorunuyordu. Sessiz hata.
  console.log("");
  console.log(CIZGI);
  console.log("OLCUT 6 - ceyrek(): 1/4 asagi kirpma, dairenin rakamiyla ayni mi?");
  console.log(CIZGI);
  const ok = ceyrek("28075.50").esit(des("7018.87"));
  console.log("  2026: net 28.075,50 -> 1/4 = " + ceyrek("28075.50")
    + "   beklenen 7018.87 (tutanaktaki rakam)  " + (ok ? "TAMAM" : "HATA"));
  console.log("");
  console.log("  !! DAIRE KENDI ICINDE TUTARSIZ -- ceyrek() iki yili birden veremez:");
  console.log("     2026: 28.075,50 / 4 = 7.018,875  -> daire 7.018,87 (ASAGI kirpmis)");
  console.log("     2025: 22.104,67 / 4 = 5.526,1675 -> daire 5.526,17 (YUKARI yuvarlamis)");
  console.log("     ceyrek() asagi kirpar, yani 2025 icin 5.526,16 der; daire 5.526,17 demis.");
  console.log("     Bu bir kod hatasi DEGIL: daire muhtemelen kendi bolmuyor, avukat");
  console.log("     sitelerinde yayimlanan 'maksimum kesinti' tablosunu kopyaliyor ve o");
  console.log("     tablolar da tutarli yuvarlamiyor. hesap.py bu yuzden ayarlar.json'daki");
  console.log("     ELLE yazilmis 'ceyrek' degerini kullanir -- dogru tasarim, boyle kalsin.");
  console.log("     ceyrek() sadece ayarlar.json'da kayit YOKSA yaklasik deger icindir.");
  return ok;
}

function main() {
  const sonuc = [
    ["Olcut 1 (60 ay net asgari ucret)", olcut1()],
    ["Olcut 2/3 (2026 istisna tutarlari)", olcut2()],
    ["Olcut 6 (ceyrek 1/4 kirpmasi)", olcut6()],
  ];
  olcut4();
  olcut5();
  console.log("");
  console.log(CIZGI);
  for (const [ad, ok] of sonuc) {
    console.log("  " + sol(ad, 40) + " " + (ok ? "GECTI" : "KALDI"));
  }
  console.log(CIZGI);
  return sonuc.every(([, ok]) => ok) ? 0 : 1;
}

process.exit(main());
