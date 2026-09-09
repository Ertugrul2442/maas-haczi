// net_maas.py'nin BIREBIR portu -- brutten nete ucret hesabi.
//
// Dayanak, formul ve gerekcelerin tamami net_maas.py'nin basindaki aciklamada;
// burada tekrarlanmadi ki iki dosya ayrisirsa hangisinin dogru oldugu
// tartisilmasin. Kisaca: IIK 83'teki 1/4 NET ucretten hesaplanir, asgari
// ucretin USTUNDE "brut x 0,85" kestirmesi yanlistir, bu modul kanunun kendi
// kurallariyla hesaplar (GVK 103, GVK 23/1-18, 319 s. Teblig, 488 s. DVK,
// 5510 s.K. 80).
//
// ⚠ PORT KURALI: fonksiyon ve degisken adlari Python'daki adlarin AYNISI
// (snake_case) -- JS aliskanligina aykiri ama bilincli. Iki dosya yan yana
// konup satir satir kiyaslanabilsin diye; bu projede "sayi dogru, metin
// yanlis" turu sessiz hatalar tekrar tekrar cikti.
//
// ⚠ Decimal: desimal.js kullaniliyor, float DEGIL. Sebep orada yazili.
//
// DOGRULANDI (09.09.2026), tahmin degil:
//   - test_net_maas.js 60/60 ay resmi net asgari ucreti veriyor ve ciktisi
//     Python testinin ciktisiyla HARFI HARFINE ayni (77 satir, diff temiz).
//   - kiyas_net_maas.js ile Python'a karsi 28.964 senaryo tarandi:
//     0 deger farki. Tavan kirpmasi 1.044 kez devreye girdi.
//   - tarayici_kontrol.js: require/module olmadan da yukleniyor.

(function (kok) {
  "use strict";

  const _D = (typeof require === "function")
    ? require("./desimal.js") : kok.Desimal;
  const des = _D.des;
  const enkucuk = _D.enkucuk;

  class NetMaasHatasi extends Error {
    constructor(mesaj) {
      super(mesaj);
      this.name = "NetMaasHatasi";
    }
  }

  // Kurusa yuvarla, yarim yukari (Python: _k). Bordro pratigi budur.
  // NOT: hesap.py'deki 1/4 kirpmasiyla karistirma -- orada 1/4 yasal UST SINIR
  // oldugu icin ASAGI kirpiliyor. Burada kesintiler yuvarlaniyor.
  function _k(x) {
    return des(x).yuvarla(2, "HALF_UP");
  }

  // GVK m.103 tarifesi -- UCRET gelirleri icin (3. ve 4. dilim sinirlari diger
  // gelirlerden FARKLI). [dilim ust siniri, oran], son dilim sinirsiz (null).
  const TARIFE = {
    2021: [[24000, "0.15"], [53000, "0.2"], [190000, "0.27"], [650000, "0.35"], [null, "0.4"]],
    2022: [[32000, "0.15"], [70000, "0.2"], [250000, "0.27"], [880000, "0.35"], [null, "0.4"]],
    2023: [[70000, "0.15"], [150000, "0.2"], [550000, "0.27"], [1900000, "0.35"], [null, "0.4"]],
    2024: [[110000, "0.15"], [230000, "0.2"], [870000, "0.27"], [3000000, "0.35"], [null, "0.4"]],
    2025: [[158000, "0.15"], [330000, "0.2"], [1200000, "0.27"], [4300000, "0.35"], [null, "0.4"]],
    2026: [[190000, "0.15"], [400000, "0.2"], [1500000, "0.27"], [5300000, "0.35"], [null, "0.4"]],
  };

  // Damga vergisi: binde 7,59 (488 s.K.)
  const DAMGA_ORANI = des("0.00759");

  // Brut asgari ucret donemleri. Yil ortasi zamlari ayri kayit.
  const ASGARI_BRUT = [
    ["2021-01", "3577.50"],
    ["2022-01", "5004.00"],
    ["2022-07", "6471.00"],
    ["2023-01", "10008.00"],
    ["2023-07", "13414.50"],
    ["2024-01", "20002.50"],
    ["2025-01", "26005.50"],
    ["2026-01", "33030.00"],
  ];

  // SGK prime esas kazanc tavani = aylik asgari ucretin N kati.
  // 2026'dan itibaren 7,5 -> 9 kata cikti.
  const TAVAN_KAT = [["2021-01", "7.5"], ["2026-01", "9"]];

  function _iki(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function _donem_sec(tablo, yil, ay, ne) {
    const an = yil + "-" + _iki(ay);
    let sec = null;
    for (const [bas, deg] of tablo) {
      if (bas <= an) sec = deg;
    }
    if (sec === null) {
      throw new NetMaasHatasi(
        an + " donemi icin " + ne + " tanimli degil -- net_maas.js'e eklenmeli.");
    }
    return des(sec);
  }

  // O ayda gecerli BRUT asgari ucret (aylik, 30 gun).
  function brut_asgari(yil, ay) {
    return _donem_sec(ASGARI_BRUT, yil, ay, "asgari ucret");
  }

  // O ayin prime esas kazanc ust siniri (aylik, 30 gun).
  function sgk_tavan(yil, ay) {
    return brut_asgari(yil, ay).carp(_donem_sec(TAVAN_KAT, yil, ay, "SGK tavan kati"));
  }

  // Yil basindan itibaren toplam matrah uzerinden toplam vergi.
  function _tarife_vergisi(matrah, yil) {
    if (!(yil in TARIFE)) {
      throw new NetMaasHatasi(
        yil + " yili gelir vergisi tarifesi tanimli degil -- TARIFE'ye eklenmeli.");
    }
    const m = des(matrah);
    let top = des(0);
    let alt = des(0);
    for (const [ustHam, oran] of TARIFE[yil]) {
      const ust = ustHam === null ? null : des(ustHam);
      const dilim = (ust === null || m.kucuk(ust)) ? m.cikar(alt) : ust.cikar(alt);
      if (dilim.kiyas(0) <= 0) break;
      top = top.topla(dilim.carp(des(oran)));
      if (ust === null || m.kucuk(ust)) break;
      alt = ust;
    }
    return top;
  }

  // [brut, sgk, issizlik, gv_matrahi] -- tavan kirpmasi dahil.
  function _kesintiler(brutHam, yil, ay, gun, sgdp) {
    if (gun === undefined) gun = 30;
    const brut = des(brutHam);
    const tavan = sgk_tavan(yil, ay).carp(des(gun)).bol(des(30));
    const pek = enkucuk(brut, tavan);
    let sgk;
    let issizlik;
    if (sgdp) {
      // emekli, sosyal guvenlik destek primi %7,5
      sgk = _k(pek.carp(des("0.075")));
      issizlik = des("0.00");
    } else {
      sgk = _k(pek.carp(des("0.14")));
      issizlik = _k(pek.carp(des("0.01")));
    }
    return [brut, sgk, issizlik, brut.cikar(sgk).cikar(issizlik)];
  }

  // O ay asgari ucret uzerinden hesaplanmasi gereken GV ve damga.
  // 319 s. Teblig m.6/1 son cumle: istisnayla saglanan menfaat, asgari ucretin
  // ilgili ayda hesaplanan vergisini asamaz. Asgari ucretlinin kendi kumulatif
  // matrahi da yil icinde dilim atladigi icin istisna tutari SABIT DEGILDIR.
  function _asgari_istisna(yil, ay, kum_asgari) {
    const ba = brut_asgari(yil, ay);
    const m = _kesintiler(ba, yil, ay, 30, false)[3];
    const gv = _k(_tarife_vergisi(des(kum_asgari).topla(m), yil)
      .cikar(_tarife_vergisi(des(kum_asgari), yil)));
    return [gv, m, _k(ba.carp(DAMGA_ORANI))];
  }

  // Tek bir ayin bordrosu. Alanlarin hepsi Des doner.
  //   kumulatif_matrah : ayni isverende yil basindan bu aya kadar biriken matrah
  //   kumulatif_asgari : asgari ucretlinin ayni tarihteki kumulatifi. null ise
  //                      (ay-1) tam ay varsayilir -- normal hal.
  //   istisna_var      : false ise asgari ucret istisnasi uygulanmaz. Birden
  //                      fazla isverenden ucret alanda istisna SADECE en yuksek
  //                      ucrete uygulanir (GVK 23/1-18 son cumle).
  function aylik_net(brutHam, yil, ay, secenek) {
    const o = secenek || {};
    const kumulatif_matrah = o.kumulatif_matrah === undefined ? 0 : o.kumulatif_matrah;
    const gun = o.gun === undefined ? 30 : o.gun;
    const sgdp = o.sgdp === undefined ? false : o.sgdp;
    const istisna_var = o.istisna_var === undefined ? true : o.istisna_var;

    const [brut, sgk, issizlik, matrah] = _kesintiler(brutHam, yil, ay, gun, sgdp);

    let kumulatif_asgari = o.kumulatif_asgari;
    if (kumulatif_asgari === undefined || kumulatif_asgari === null) {
      kumulatif_asgari = des(0);
      for (let a = 1; a < ay; a++) {
        kumulatif_asgari = kumulatif_asgari.topla(_asgari_istisna(yil, a, kumulatif_asgari)[1]);
      }
    } else {
      kumulatif_asgari = des(kumulatif_asgari);
    }

    const kum = des(kumulatif_matrah);
    const gv = _k(_tarife_vergisi(kum.topla(matrah), yil).cikar(_tarife_vergisi(kum, yil)));
    const damga = _k(brut.carp(DAMGA_ORANI));

    let uyg_gv;
    let uyg_damga;
    if (istisna_var) {
      const [ist_gv, , ist_damga] = _asgari_istisna(yil, ay, kumulatif_asgari);
      // Istisna vergiyi sifirin altina indiremez (iade yok).
      uyg_gv = enkucuk(gv, ist_gv);
      uyg_damga = enkucuk(damga, ist_damga);
    } else {
      uyg_gv = des("0.00");
      uyg_damga = des("0.00");
    }

    const net = brut.cikar(sgk).cikar(issizlik)
      .cikar(gv.cikar(uyg_gv))
      .cikar(damga.cikar(uyg_damga));

    return {
      yil: yil, ay: ay, brut: brut, sgk: sgk, issizlik: issizlik,
      matrah: matrah, kumulatif: kum.topla(matrah),
      gelir_vergisi: gv, gv_istisnasi: uyg_gv, odenecek_gv: gv.cikar(uyg_gv),
      damga: damga, damga_istisnasi: uyg_damga,
      odenecek_damga: damga.cikar(uyg_damga), net: net,
    };
  }

  // O ayin gelir vergisi matrahi (brut - SGK - issizlik).
  // Kumulatifi disaridan tasimak icin var: hesap.js, SGK dokumundeki her ayin
  // PEK'inden bu fonksiyonla matrah cikarip topluyor. aylik_net()'i cagirmak da
  // ayni sonucu verirdi ama o, tarifesi tanimli olmayan yilda gereksiz yere
  // patliyor -- matrah icin tarife gerekmiyor.
  function gv_matrahi(brut, yil, ay, gun, sgdp) {
    return _kesintiler(brut, yil, ay, gun === undefined ? 30 : gun,
      sgdp === undefined ? false : sgdp)[3];
  }

  // Bir yilin aylarini sirayla hesaplar, kumulatifi kendisi tasir.
  function yil_bordrosu(brut_aylik, yil, aylar, secenek) {
    const o = Object.assign({}, secenek || {});
    const liste = aylar === undefined || aylar === null
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : aylar.slice();
    let kum = des(o.kumulatif_matrah === undefined ? 0 : o.kumulatif_matrah);
    delete o.kumulatif_matrah;
    let kum_asg = des(0);
    const cikti = [];
    const ilk = liste.length ? Math.min.apply(null, liste) : 1;
    for (let a = 1; a < ilk; a++) {
      kum_asg = kum_asg.topla(_asgari_istisna(yil, a, kum_asg)[1]);
    }
    for (const ay of liste) {
      const s = aylik_net(brut_aylik, yil, ay,
        Object.assign({}, o, { kumulatif_matrah: kum, kumulatif_asgari: kum_asg }));
      cikti.push(s);
      kum = s.kumulatif;
      kum_asg = kum_asg.topla(_asgari_istisna(yil, ay, kum_asg)[1]);
    }
    return cikti;
  }

  // Net ucretin 1/4'u -- IIK 83. ASAGI kirpilir (yasal ust sinir asilmasin).
  function ceyrek(net) {
    return des(net).bol(des(4)).yuvarla(2, "DOWN");
  }

  const disa = {
    TARIFE, ASGARI_BRUT, TAVAN_KAT, DAMGA_ORANI,
    brut_asgari, sgk_tavan, aylik_net, yil_bordrosu, ceyrek, gv_matrahi,
    _asgari_istisna, _tarife_vergisi, _kesintiler, _k, NetMaasHatasi,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.NetMaas = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
