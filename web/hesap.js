// hesap.py'nin BIREBIR portu -- IIK 355-356 isveren sorumlulugu hesabi.
//
// Gerekcelerin, hukuki dayanagin ve kural tartismalarinin tamami hesap.py'nin
// kendi yorumlarinda; burada tekrarlanmadi ki iki dosya ayrisirsa hangisinin
// dogru oldugu tartisilmasin.
//
// ⚠ PORT KURALI: adlar Python'daki adlarin AYNISI (snake_case). JS
// aliskanligina aykiri ama bilincli -- iki dosya yan yana konup satir satir
// kiyaslanabilsin diye.
//
// ⚠⚠ EN ONEMLI TUZAK -- KARISTIRMA:
//   hesap.py  FLOAT kullanir  -> burada  yuvarla.js  (yuvarla2)
//   net_maas.py DECIMAL kullanir -> orada desimal.js
// hesap.py'nin kendi tuzak listesinde 1 numara: "Yuvarlama float ile
// yapilmali, Decimal ile degil -- kagittaki bes kismi ay tutarini SADECE
// Python'un round(float)'u uretiyor. Decimal'e cevirme, hesap bozulur."
// Yani buradaki her round(x, 2) yuvarla2(x) olmak ZORUNDA; Math.round degil
// (olculdu: 864 yerde yaniliyor), desimal.js de degil.
//
// ⚠ BU DOSYA SAF MOTOR: dosya okumaz. SGK dokumunu okuyup kayit dizisi
// uretmek ayri is (tarayicida SheetJS, masaustunde xlrd). Nafakadaki kalibin
// aynisi -- motorun tek basina test edilebilmesi icin.
//
// TARIH: JS'in Date'i saat dilimi yuzunden sessizce gun kaydirabiliyor.
// Onun yerine duz {yil, ay, gun} nesnesi kullaniliyor.

(function (kok) {
  "use strict";

  const _Y = (typeof require === "function")
    ? require("./yuvarla.js") : kok.Yuvarla;
  const net_maas = (typeof require === "function")
    ? require("./net_maas.js") : kok.NetMaas;
  const yuvarla2 = _Y.yuvarla2;

  const AYLAR_TR = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  // ------------------------------------------------------------------------
  // Bicimlendirme
  // ------------------------------------------------------------------------

  // 1234.5 -> '1.234,50'
  // Python: f"{x:,.2f}" -- float'in GERCEK degerine gore cifte yuvarlar.
  // JS'in toFixed'i yarimlarda yukari kacar, o yuzden once yuvarla2.
  function tl(x) {
    const kurus = Math.round(yuvarla2(x) * 100);
    const eksi = kurus < 0;
    const m = String(Math.abs(kurus)).padStart(3, "0");
    const tam = m.slice(0, m.length - 2);
    const kes = m.slice(m.length - 2);
    return (eksi ? "-" : "") + tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + kes;
  }

  function _ikiHane(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function tarih_str(d) {
    return _ikiHane(d.gun) + "." + _ikiHane(d.ay) + "." + d.yil;
  }

  // --- Turkce buyuk/kucuk harf ---------------------------------------------
  // JS'in kendi toUpperCase()'i de Turkce bilmez ("icra" -> "ICRA", noktali I
  // vermez). Python tarafindaki cozumun aynisi: once i/I ciftleri degistir.

  function buyuk_harf(metin) {
    return (metin || "").replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
  }

  function kucuk_harf(metin) {
    return (metin || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  }

  // 'ahmet yilmaz' -> 'Ahmet YILMAZ'  (soyad = son bosluktan sonraki kelime)
  function ad_bicimle(ad) {
    const parca = (ad || "").split(/\s+/).filter((p) => p.length);
    if (!parca.length) return "";
    if (parca.length === 1) return buyuk_harf(parca[0]);
    const adlar = parca.slice(0, -1)
      .map((p) => buyuk_harf(p.slice(0, 1)) + kucuk_harf(p.slice(1)));
    return adlar.join(" ") + " " + buyuk_harf(parca[parca.length - 1]);
  }

  const _SADECE_SAYI = /^(\d+)\.?$/;

  // '3' -> '3. İCRA DAİRESİ';  yazi varsa oldugu gibi BUYUK harfe cevirir.
  function daire_bicimle(metin) {
    const t = (metin || "").trim();
    const m = _SADECE_SAYI.exec(t);
    if (m) return m[1] + ". İCRA DAİRESİ";
    return buyuk_harf(t);
  }

  // Dosya borcu alani dolduruldu mu? (para_coz bos alani 0 dondurur)
  function borc_girildi(s) {
    return Boolean(s.dosya_borcu && s.dosya_borcu > 0);
  }

  // --- Turkce ek uyumu -----------------------------------------------------

  const _KALIN_DUZ = "aı";
  const _KALIN_YUV = "ou";
  const _INCE_DUZ = "ei";
  const _INCE_YUV = "öü";
  const _UNLULER = _KALIN_DUZ + _KALIN_YUV + _INCE_DUZ + _INCE_YUV;

  function _son_unlu(kelime) {
    for (let i = kelime.length - 1; i >= 0; i--) {
      if (_UNLULER.indexOf(kelime[i]) >= 0) return kelime[i];
    }
    return null;
  }

  // Python'un strip(".") karsiligi: bas ve sondaki noktalari atar.
  function _nokta_kirp(t) {
    let a = 0;
    let b = t.length;
    while (a < b && t[a] === ".") a++;
    while (b > a && t[b - 1] === ".") b--;
    return t.slice(a, b);
  }

  // 'ÖRNEK GIDA LTD. ŞTİ.' -> 'şti'
  function _son_kelime(ad) {
    const parca = _nokta_kirp((ad || "").trim()).split(/\s+/).filter((p) => p.length);
    if (!parca.length) return "";
    return _nokta_kirp(parca[parca.length - 1])
      .replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  }

  // Kisaltmalar sesletildikleri gibi ek alir: "A.Ş." -> "anonim sirketi'nin"
  const _KISALTMA = {
    "a.ş": ["nin", "ye"], "aş": ["nin", "ye"],
    "ltd": ["nin", "ye"], "şti": ["nin", "ye"],
  };

  // Ilgi (tamlayan) eki: ALTUNAY -> ALTUNAY'ın, ŞTİ. -> ŞTİ.'nin
  function ek_ilgi(ad) {
    const k = _son_kelime(ad);
    if (Object.prototype.hasOwnProperty.call(_KISALTMA, k)) {
      return ad + "'" + _KISALTMA[k][0];
    }
    const u = _son_unlu(k);
    let ek;
    if (u === null) ek = "in";
    else if (_KALIN_DUZ.indexOf(u) >= 0) ek = "ın";
    else if (_KALIN_YUV.indexOf(u) >= 0) ek = "un";
    else if (_INCE_DUZ.indexOf(u) >= 0) ek = "in";
    else ek = "ün";
    if (k && _UNLULER.indexOf(k[k.length - 1]) >= 0) ek = "n" + ek;
    return ad + "'" + ek;
  }

  // Yonelme (-e) eki: ŞTİ. -> ŞTİ.'ye, ALTUNAY -> ALTUNAY'a
  function ek_yonelme(ad) {
    const k = _son_kelime(ad);
    if (Object.prototype.hasOwnProperty.call(_KISALTMA, k)) {
      return ad + "'" + _KISALTMA[k][1];
    }
    const u = _son_unlu(k);
    let ek = (u !== null && (_KALIN_DUZ + _KALIN_YUV).indexOf(u) >= 0) ? "a" : "e";
    if (k && _UNLULER.indexOf(k[k.length - 1]) >= 0) ek = "y" + ek;
    return ad + "'" + ek;
  }

  // '25.11.2025', '25/11/2025', '2025-11-25' kabul eder.
  function tarih_coz(metin) {
    const t = (metin || "").trim();
    let m;
    if ((m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/.exec(t))) {
      return _tarih_kur(+m[3], +m[2], +m[1], t);
    }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
      return _tarih_kur(+m[1], +m[2], +m[3], t);
    }
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(t))) {
      // Python %y: 00-68 -> 2000'ler, 69-99 -> 1900'ler
      const yy = +m[3];
      return _tarih_kur(yy <= 68 ? 2000 + yy : 1900 + yy, +m[2], +m[1], t);
    }
    throw new Error("Tarih anlasilamadi: '" + t + "'  (ornek: 25.11.2025)");
  }

  const _AY_UZUNLUK = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function _artik(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function _tarih_kur(yil, ay, gun, ham) {
    const uzun = (ay === 2 && _artik(yil)) ? 29 : _AY_UZUNLUK[ay] || 0;
    if (ay < 1 || ay > 12 || gun < 1 || gun > uzun) {
      throw new Error("Tarih anlasilamadi: '" + ham + "'  (ornek: 25.11.2025)");
    }
    return { yil: yil, ay: ay, gun: gun };
  }

  function tarih_no(d) {
    return d.yil * 10000 + d.ay * 100 + d.gun;
  }

  // '33.121,92' veya '33121.92' -> 33121.92
  function para_coz(metin) {
    let t = (metin || "").trim().split(" ").join("").split("TL").join("");
    if (!t) return 0.0;
    if (t.indexOf(",") >= 0) {
      t = t.split(".").join("").replace(",", ".");
    }
    const v = Number(t);
    if (!isFinite(v)) throw new Error("Sayi anlasilamadi: '" + metin + "'");
    return v;
  }

  // ------------------------------------------------------------------------
  // Ay anahtari: (yil, ay) ciftini tek sayiya indiriyoruz -- Python'daki
  // tuple kiyaslamasinin ("(2025,12) < (2026,1)") karsiligi.
  // ------------------------------------------------------------------------

  function ay_no(yil, ay) {
    return yil * 100 + ay;
  }

  function no_yil(n) {
    return Math.floor(n / 100);
  }

  function no_ay(n) {
    return n % 100;
  }

  function _ay_ilerle(n) {
    const y = no_yil(n);
    const a = no_ay(n);
    return a === 12 ? ay_no(y + 1, 1) : ay_no(y, a + 1);
  }

  // ------------------------------------------------------------------------
  // Ayarlar (asgari ucret tablosu)
  // ------------------------------------------------------------------------

  class Ayarlar {
    constructor(ay_gun, oran, donemler) {
      this.ay_gun = ay_gun;
      this.oran = oran;
      this.donemler = donemler; // [{yil, ay, net, ceyrek, brut}]
    }

    // Python'daki yukle()'nin karsiligi, ama dosya OKUMAZ: ayarlar.json'un
    // cozulmus hali disaridan verilir (tarayicida fetch, Node'da require).
    static kur(veri) {
      if (typeof veri === "string") veri = JSON.parse(veri);
      const ay_gun = parseInt(veri.ay_gun === undefined ? 30 : veri.ay_gun, 10);
      const oran = veri.oran === undefined ? 0.25 : Number(veri.oran);
      const donemler = [];
      for (const d of veri.donemler) {
        const p = String(d.baslangic).split("-");
        const net = Number(d.net);
        donemler.push({
          yil: parseInt(p[0], 10),
          ay: parseInt(p[1], 10),
          net: net,
          ceyrek: ("ceyrek" in d) ? Number(d.ceyrek) : yuvarla2(net * oran),
          brut: ("brut" in d) ? Number(d.brut) : null,
        });
      }
      donemler.sort((a, b) => ay_no(a.yil, a.ay) - ay_no(b.yil, b.ay));
      return new Ayarlar(ay_gun, oran, donemler);
    }

    // O ay icin gecerli {net, ceyrek, brut}. brut null olabilir.
    donem_bul(yil, ay) {
      const hedef = ay_no(yil, ay);
      let bulunan = null;
      for (const d of this.donemler) {
        if (ay_no(d.yil, d.ay) <= hedef) bulunan = d;
        else break;
      }
      if (bulunan === null) {
        throw new Error(ay + "/" + yil + " icin asgari ucret tanimli degil. "
          + "ayarlar.json dosyasina bu donemi ekle.");
      }
      return { net: bulunan.net, ceyrek: bulunan.ceyrek, brut: bulunan.brut };
    }

    son_donem() {
      const d = this.donemler[this.donemler.length - 1];
      return { yil: d.yil, ay: d.ay };
    }
  }

  // ------------------------------------------------------------------------
  // Sigortalilik kolu -- PEK sutunu SADECE 4a'da brut ucreti verir.
  // Sebebin tamami hesap.py'deki uzun yorumda (4c'de memur maasinin buyuk
  // kismi prime esas kazanca girmiyor, PEK cogu zaman tam asgari ucrete
  // yapisik cikiyor). O yorumu SILME.
  // ------------------------------------------------------------------------

  const KOL_ADI = {
    "4a": "4a (SSK - isci)",
    "4b": "4b (Bagkur - esnaf/tarim)",
    "4c": "4c (Emekli Sandigi - memur/kamu)",
  };

  function kol_ozeti(kayitlar) {
    const ozet = {};
    for (const k of kayitlar) ozet[k.kol] = (ozet[k.kol] || 0) + 1;
    return ozet;
  }

  function kol_uyarisi(kayitlar) {
    const ozet = kol_ozeti(kayitlar);
    const disi = ["4c", "4b"].filter((k) => ozet[k]);
    if (!disi.length) return "";

    const liste = disi.map((k) => KOL_ADI[k] + ": " + ozet[k] + " kayit").join(", ");
    let bas;
    if (ozet["4a"]) {
      bas = "!!! DOKUMDE 4a DISI KAYIT DA VAR (" + liste + "). Hesap yalniz 4a "
        + "(isci) aylarini kapsiyor, bu donemler disarida kaldi.";
    } else {
      bas = "!!! DOKUMDE HIC 4a (isci) KAYDI YOK -- sadece " + liste + ". "
        + "Bu program bu dosyayla hesap YAPAMAZ.";
    }

    if (ozet["4c"]) {
      bas += " Sebep: memurun PEK sutunu gercek maasini VERMEZ. Ek odeme, aile "
        + "yardimi, yan odeme, sosyal denge tazminati prime esas kazanca "
        + "girmiyor (5510 m.80/3); kalan tutar asgari ucretin altina duserse "
        + "asgari ucret bildiriliyor (5510 m.82). Bu yuzden memurun PEK'i "
        + "cogu zaman tam asgari ucrete yapisik cikar. Memur/kamu gorevlisi "
        + "dosyasinda maas bilgisi KURUMDAN (maas bordrosu / saymanlik) "
        + "istenmeli, bu dokumden cikarilamaz.";
    }
    return bas;
  }

  // ------------------------------------------------------------------------
  // Isveren secimi
  // ------------------------------------------------------------------------

  function isveren_etiket(o) {
    const yildiz = o.teblig_ayinda_var ? " *" : "";
    return o.isyeri + "  (" + _ikiHane(no_ay(o.ilk)) + "/" + no_yil(o.ilk)
      + " - " + _ikiHane(no_ay(o.son)) + "/" + no_yil(o.son)
      + ", " + o.ay_sayisi + " ay)" + yildiz;
  }

  // Dokumdeki 4a isverenleri, en uygunu basta. teblig/karar VERILMEZSE
  // dokumdeki butun isverenler listelenir -- arayuz dosyayi tarihler
  // girilmeden once okuyor ve eskiden liste bos kalip HICBIR SEY
  // soylenmiyordu (kullanici "isveren cikmiyor" diye takiliyordu).
  function isverenleri_listele(kayitlar, teblig, karar) {
    const t_ay = teblig ? ay_no(teblig.yil, teblig.ay) : null;
    const k_ay = karar ? ay_no(karar.yil, karar.ay) : null;
    const gruplar = new Map();
    for (const k of kayitlar) {
      if (k.kol !== "4a" || !k.isyeri) continue;
      if (!gruplar.has(k.isyeri)) gruplar.set(k.isyeri, []);
      gruplar.get(k.isyeri).push(ay_no(k.yil, k.ay));
    }

    const ozetler = [];
    for (const [isyeri, aylar] of gruplar) {
      const arada = aylar.filter((a) =>
        (t_ay === null || a >= t_ay) && (k_ay === null || a <= k_ay));
      if (!arada.length) continue;
      ozetler.push({
        isyeri: isyeri,
        ilk: Math.min.apply(null, aylar),
        son: Math.max.apply(null, aylar),
        ay_sayisi: new Set(arada).size,
        teblig_ayinda_var: (t_ay !== null && aylar.indexOf(t_ay) >= 0),
      });
    }
    ozetler.sort((a, b) => {
      if (a.teblig_ayinda_var !== b.teblig_ayinda_var) {
        return a.teblig_ayinda_var ? -1 : 1;
      }
      if (a.ay_sayisi !== b.ay_sayisi) return b.ay_sayisi - a.ay_sayisi;
      return a.isyeri < b.isyeri ? -1 : a.isyeri > b.isyeri ? 1 : 0;
    });
    return ozetler;
  }

  // ------------------------------------------------------------------------
  // PEK'ten net ucret icin yardimcilar (net_maas.js'i besleyen kisim)
  // ------------------------------------------------------------------------

  // {ay_no: [toplam_pek, toplam_gun]} -- sadece bu isverenin 4a satirlari.
  function _isveren_aylik_pek(kayitlar, isyeri) {
    const d = new Map();
    for (const k of kayitlar) {
      if (k.kol !== "4a" || k.isyeri !== isyeri) continue;
      const a = ay_no(k.yil, k.ay);
      const o = d.get(a) || [0.0, 0];
      d.set(a, [o[0] + k.pek, o[1] + k.gun]);
    }
    return d;
  }

  // ({ay_no: o aydan ONCE birikmis GV matrahi}, eksik_veri_aylari)
  // Kumulatif her Ocak'ta ve isveren degisince sifirlanir, o yuzden tablo tek
  // bir isverenin kayitlariyla kuruluyor.
  function _kumulatif_tablosu(aylik_pek, ay_gun) {
    if (ay_gun === undefined) ay_gun = 30;
    const tablo = new Map();
    const eksik = [];
    let kum = 0.0;
    let onceki_yil = null;
    const sirali = Array.from(aylik_pek.keys()).sort((a, b) => a - b);
    for (const a of sirali) {
      const y = no_yil(a);
      if (y !== onceki_yil) {
        kum = 0.0;
        onceki_yil = y;
      }
      tablo.set(a, kum);
      const [pek, gun] = aylik_pek.get(a);
      if (pek > 0 && gun > 0) {
        kum += Number(net_maas.gv_matrahi(pek, y, no_ay(a), Math.min(gun, ay_gun)).toString());
      } else {
        eksik.push(a); // sessiz gecme: kumulatif eksik kalir
      }
    }
    return { tablo: tablo, eksik: eksik };
  }

  // {ay_no: en_yuksek_PEK} -- SADECE birden fazla isveren olan aylar.
  // GVK 23/1-18 son cumlesi: ayni anda birden fazla isverenden ucret alanda
  // asgari ucret istisnasi YALNIZCA en yuksek ucrete uygulanir. Esitlikte
  // istisna VERILIR ki program kendi kafasina gore birini cezalandirmasin.
  function _en_yuksek_isveren(kayitlar) {
    const ayl = new Map();
    for (const k of kayitlar) {
      if (k.kol !== "4a" || !k.isyeri) continue;
      const a = ay_no(k.yil, k.ay);
      if (!ayl.has(a)) ayl.set(a, new Map());
      const d = ayl.get(a);
      d.set(k.isyeri, (d.get(k.isyeri) || 0.0) + k.pek);
    }
    const cikti = new Map();
    for (const [a, d] of ayl) {
      if (d.size > 1) cikti.set(a, Math.max.apply(null, Array.from(d.values())));
    }
    return cikti;
  }

  // ------------------------------------------------------------------------
  // Hesap
  // ------------------------------------------------------------------------

  // Isverenin sorumlu oldugu tutari ay ay hesaplar.
  //
  // MAAS VARSAYIMI YOK. Her ayin ucreti SGK dokumunun "PEK" sutunundan
  // okunur. Ayin neti uc yoldan biriyle bulunur (Kalem.net_kaynak):
  //   "asgari"  : SGK kazanci tam asgari ucret -> yayimlanmis net ve
  //               ayarlar.json'daki 1/4 (dairenin yuvarlamasi korunsun diye).
  //   "pek"     : kazanc asgari ucretten FARKLI -> o ayin neti kanun
  //               formuluyle (net_maas.js, kumulatif matrah ay ay tasinir).
  //   "veri-yok": dokumde kazanc yok -> asgari ucretle doldurulur ama
  //               BAGIRILIR; bu bir varsayim degil, doldurulmasi gereken
  //               BOSLUK.
  //
  // kusur: sadece tutanak dilini secer, hesabi degistirmez.
  function hesapla(kayitlar, isyeri, teblig, karar, dosya_borcu, ayarlar,
                   kisi, kusur) {
    kisi = kisi === undefined ? "" : kisi;
    kusur = kusur === undefined ? "cevap-yok" : kusur;

    if (tarih_no(karar) < tarih_no(teblig)) {
      throw new Error("Karar tarihi teblig tarihinden once olamaz.");
    }

    const AY_GUN = ayarlar.ay_gun;
    const uyarilar = [];

    // Ayni ay/isyeri icin birden fazla satir olabilir (farkli giris), topla.
    const gunler = new Map();
    const pekler = new Map(); // ayni ayin butun satirlarindaki PEK TOPLAMI
    const son_kayit = new Map();
    for (const k of kayitlar) {
      if (k.kol !== "4a" || k.isyeri !== isyeri) continue;
      const anahtar = ay_no(k.yil, k.ay);
      gunler.set(anahtar, (gunler.get(anahtar) || 0) + k.gun);
      // Gun toplaniyorsa PEK de toplanmali. Toplanmazsa (eski hal) ayin
      // sadece SON satirinin kazanci TUM gunlere bolunuyordu ve ay yanlisla
      // "asgari ucret alti" gorunuyordu. Ornek: 1212871 / 06-2024, iki satir.
      pekler.set(anahtar, (pekler.get(anahtar) || 0.0) + k.pek);
      son_kayit.set(anahtar, k);
      if (gunler.get(anahtar) > AY_GUN) {
        uyarilar.push(AYLAR_TR[k.ay] + " " + k.yil + ": birden fazla satirdan toplam "
          + gunler.get(anahtar) + " gun cikti, " + AY_GUN + " gune indirildi.");
        gunler.set(anahtar, AY_GUN);
      }
    }

    if (!gunler.size) {
      const ek = kol_uyarisi(kayitlar);
      throw new Error(isyeri + " numarali isyerine ait 4a kaydi bulunamadi."
        + (ek ? " " + ek : ""));
    }

    // Kumulatif, hesaba giren aylardan ONCEKI aylari da kapsamali (yil
    // basindan beri birikiyor), o yuzden isverenin TUM kayitlarindan kuruluyor.
    const kt = _kumulatif_tablosu(_isveren_aylik_pek(kayitlar, isyeri), AY_GUN);
    const kum_tablo = kt.tablo;
    const pek_eksik = kt.eksik;
    const coklu_ay = _en_yuksek_isveren(kayitlar);

    const t_ay = ay_no(teblig.yil, teblig.ay);
    const k_ay = ay_no(karar.yil, karar.ay);
    const uygun = Array.from(gunler.keys()).filter((a) => a <= k_ay);
    const son_ay = uygun.length ? Math.max.apply(null, uygun) : null;
    if (son_ay === null || son_ay < t_ay) {
      throw new Error("Teblig tarihinden (" + tarih_str(teblig) + ") sonra bu "
        + "isyerinde hic SGK kaydi yok. Isveren sorumlu tutulamaz.");
    }

    const halen = (son_ay === k_ay);
    let calisma_bitisi;
    if (halen) {
      calisma_bitisi = "halen calistigi (" + tarih_str(karar) + " itibariyle)";
    } else {
      const cik = son_kayit.get(son_ay).cikis;
      if (cik) {
        calisma_bitisi = cik;
      } else {
        const n = _ay_ilerle(son_ay);
        calisma_bitisi = "01." + _ikiHane(no_ay(n)) + "." + no_yil(n);
      }
    }

    const kalemler = [];
    let imlec = t_ay;
    while (imlec <= son_ay) {
      const yil = no_yil(imlec);
      const ay = no_ay(imlec);
      let gun = gunler.get(imlec) || 0;
      let aciklama = "";

      if (gun === 0) {
        uyarilar.push(AYLAR_TR[ay] + " " + yil + ": bu ay SGK kaydi yok, hesaba katilmadi.");
        imlec = _ay_ilerle(imlec);
        continue;
      }

      if (imlec === t_ay) {
        const kalan = AY_GUN - teblig.gun;
        if (kalan <= 0) {
          uyarilar.push(AYLAR_TR[ay] + " " + yil + ": teblig ayin " + teblig.gun
            + "'inde, ay sonuna gun kalmadi, bu ay hesaba katilmadi.");
          imlec = _ay_ilerle(imlec);
          continue;
        }
        // ILK AY KURALI (02.09.2026, adliyeden alindi, Ertugrul onayladi):
        // (a) SGK dokumunde kac gun yazarsa yazsin, teblig ayinda TEBLIGDEN
        //     SONRAKI gunler sayilir; tebligden onceki calisma isvereni
        //     ilgilendirmiyor.
        // (b) Kalan gun, o ay calisilan gunden BUYUKSE o ay borclandirilmaz:
        //     dokum o ay KAC GUN sigortali olundugunu soyler, HANGI GUNLER
        //     oldugunu soylemez. Ortustugu kanitlanamadigi icin isveren
        //     lehine karar veriliyor.
        if (gun < kalan) {
          uyarilar.push(AYLAR_TR[ay] + " " + yil + " (teblig ayi): tebligden sonra kalan "
            + "gun (" + kalan + ") SGK gununden (" + gun + ") FAZLA oldugu icin bu "
            + "ay hesaba KATILMADI. Dokum bu " + gun + " gunun ayin neresine "
            + "dustugunu soylemiyor; teblig oncesine dusmus olabilirler, "
            + "o yuzden isveren lehine sayilmadi.");
          imlec = _ay_ilerle(imlec);
          continue;
        }
        aciklama = "tebliğ " + teblig.gun + "'inde, ayın kalanı";
        gun = kalan;
      }

      if (imlec === k_ay && gun > karar.gun) {
        aciklama = "karar tarihine (" + karar.gun + ".) kadar";
        gun = karar.gun;
      }

      const don = ayarlar.donem_bul(yil, ay);
      const asg_net = don.net;
      const asg_ceyrek = don.ceyrek;
      const brut = don.brut;

      // --- SGK'ya bildirilen kazanc (PEK) ve "bu asgari ucret mi" teyidi ---
      const ay_pek = pekler.get(imlec) || 0.0;
      const sgk_gun = gunler.get(imlec) || 0;
      const pek_30 = sgk_gun ? (ay_pek / sgk_gun * AY_GUN) : 0.0;

      let teyit;
      if (!brut || pek_30 <= 0) teyit = "veri-yok";
      else if (Math.abs(pek_30 - brut) <= 1.0) teyit = "teyitli";
      else if (pek_30 > brut) teyit = "asgari-ustu";
      else teyit = "asgari-alti";
      const ustu = (teyit === "asgari-ustu");

      // --- Bu ayin neti: HER ZAMAN SGK dokumundeki kazanctan ---------------
      let net_kaynak = "asgari";
      let kumulatif = 0.0;
      let net;
      let ceyrek;

      if (teyit === "veri-yok") {
        // Kazanc bilgisi yok. Bu bir varsayim degil, BOSLUK -- bagir.
        net = asg_net;
        ceyrek = asg_ceyrek;
        net_kaynak = "veri-yok";
        uyarilar.push("!!! " + AYLAR_TR[ay] + " " + yil + ": dokumde bu ayin kazanci (PEK) YOK. "
          + "Hesap yapilabilsin diye asgari ucret kullanildi (" + tl(asg_net)
          + " TL, 1/4 = " + tl(asg_ceyrek) + " TL) ama bu bir TAHMIN. Dokumu "
          + "kontrol et, gerekirse isverenden bordro iste.");
      } else if (teyit === "teyitli") {
        // SGK kazanci tam asgari ucret. Yayimlanmis net ve dairenin kullandigi
        // 1/4 rakami kullaniliyor (kanun formulu de ayni neti veriyor).
        net = asg_net;
        ceyrek = asg_ceyrek;
      } else {
        // Kazanc asgari ucretten FARKLI. O ayin neti kanun formuluyle
        // hesaplanir; vergi kumulatif matraha gore artan oranli oldugu icin
        // ayni brutte bile her ay farkli borc cikar.
        kumulatif = kum_tablo.has(imlec) ? kum_tablo.get(imlec) : 0.0;
        const istisna_var = (!coklu_ay.has(imlec)
          || ay_pek >= coklu_ay.get(imlec) - 0.01);
        try {
          const bordro = net_maas.aylik_net(pek_30, yil, ay, {
            kumulatif_matrah: kumulatif, gun: AY_GUN, istisna_var: istisna_var,
          });
          net = Number(bordro.net.toString());
          ceyrek = Number(net_maas.ceyrek(net).toString());
          net_kaynak = "pek";
          const yon = ustu ? "USTUNDE" : "ALTINDA";
          const isaret = ustu ? "+" : "-";
          uyarilar.push(AYLAR_TR[ay] + " " + yil + ": SGK kazanci asgari ucretin " + yon
            + " (" + tl(pek_30) + " TL brut / asgari " + tl(brut) + " TL, fark "
            + isaret + tl(Math.abs(pek_30 - brut)) + "). Bu ayin neti KANUN "
            + "FORMULUYLE hesaplandi: kumulatif matrah " + tl(kumulatif)
            + " TL, net " + tl(net) + " TL, 1/4 = " + tl(ceyrek) + " TL (asgari ucret "
            + "alinsaydi " + tl(asg_ceyrek) + " TL olurdu).");
          if (!ustu) {
            uyarilar.push(AYLAR_TR[ay] + " " + yil + ": kazanc asgari ucretin ALTINDA "
              + "gorunuyor. Kismi sureli calisma olabilecegi gibi EKSIK "
              + "BILDIRIM de olabilir — ikincisiyse gercek borc daha "
              + "yuksektir. Dokumu ve varsa bordroyu kontrol et.");
          }
          if (!istisna_var) {
            uyarilar.push(AYLAR_TR[ay] + " " + yil + ": bu ay ayni anda birden fazla "
              + "isveren var; asgari ucret gelir vergisi istisnasi "
              + "GVK 23/1-18 geregi SADECE en yuksek ucrete uygulanir. "
              + "Bu isyeri en yuksek olmadigi icin istisnasiz "
              + "hesaplandi (net daha dusuk cikti).");
          }
        } catch (e) {
          if (!(e instanceof net_maas.NetMaasHatasi)) throw e;
          net = asg_net;
          ceyrek = asg_ceyrek;
          net_kaynak = "veri-yok";
          uyarilar.push("!!! " + AYLAR_TR[ay] + " " + yil + ": SGK kazanci " + tl(pek_30)
            + " TL ama net ucret HESAPLANAMADI (" + e.message + "). Bu ay asgari "
            + "ucretten hesaplandi, yani TUTAR YANLIS. net_maas.py'ye ilgili "
            + "yilin tarifesini ekleyip tekrar calistir.");
        }
      }

      const tutar = gun >= AY_GUN ? ceyrek : yuvarla2(ceyrek / AY_GUN * gun);
      if (!aciklama && gun < AY_GUN) {
        const neden = son_kayit.get(imlec).eksik_neden;
        aciklama = neden ? ("SGK'da eksik gün (neden kodu " + neden + ")")
          : "SGK'da eksik gün";
      }

      kalemler.push({
        yil: yil, ay: ay, gun: gun, ceyrek: ceyrek, net: net, tutar: tutar,
        aciklama: aciklama, pek: ay_pek, pek_30: pek_30, asgari_ustu: ustu,
        teyit: teyit, net_kaynak: net_kaynak, kumulatif: kumulatif,
        ay_adi: AYLAR_TR[ay],
      });
      imlec = _ay_ilerle(imlec);
    }

    if (!kalemler.length) {
      // "Hesaplanacak ay kalmadi." demek yetmiyor; toplanan uyarilar sebebi
      // zaten yaziyor, onlari da ver.
      const neden = uyarilar.length ? uyarilar.join("\n  - ") : "sebep kaydedilmedi";
      throw new Error("Hesaplanacak ay kalmadi — teblig ile karar tarihi arasindaki her "
        + "ay elendi.\n  - " + neden);
    }

    // Ozet: maas nereden geldi? (Varsayim yok -- hepsi SGK dokumunden.)
    const n = kalemler.length;
    const pek_ay = kalemler.filter((k) => k.net_kaynak === "pek").length;
    const asg_ay = kalemler.filter((k) => k.net_kaynak === "asgari").length;
    const yok_ay = kalemler.filter((k) => k.net_kaynak === "veri-yok").length;

    if (yok_ay) {
      uyarilar.unshift("!!! " + n + " ayin " + yok_ay + "'inde kazanc bilgisi YOK, o aylar asgari "
        + "ucretle dolduruldu (tahmin). Dokumu kontrol et — hesap eksik "
        + "olabilir.");
    }
    if (pek_ay) {
      let toplamFark = 0.0;
      for (const k of kalemler) {
        if (k.net_kaynak !== "pek") continue;
        const c = ayarlar.donem_bul(k.yil, k.ay).ceyrek;
        toplamFark += k.tutar - yuvarla2(k.gun >= AY_GUN ? c : c / AY_GUN * k.gun);
      }
      const fark = yuvarla2(toplamFark);
      uyarilar.unshift("MAAS KAYNAGI: " + n + " ayin " + pek_ay + "'inde SGK'ya bildirilen kazanc "
        + "asgari ucretten farkli; o aylarin neti kanun formuluyle "
        + "(GVK 103 + 23/1-18 + 319 s. Teblig) ay ay hesaplandi. Kalan "
        + asg_ay + " ayda SGK'da tam asgari ucret yaziyor. Hepsi asgari "
        + "ucretle hesaplansaydi toplam " + tl(Math.abs(fark)) + " TL "
        + (fark > 0 ? "DUSUK" : "YUKSEK") + " olurdu.");
      const pekKalem = kalemler.filter((k) => k.net_kaynak === "pek");
      const eksik_ilgili = pek_eksik.filter((a) =>
        pekKalem.some((k) => no_yil(a) === k.yil && a <= ay_no(k.yil, k.ay)))
        .sort((x, y) => x - y);
      if (eksik_ilgili.length) {
        const liste = eksik_ilgili.map((a) => AYLAR_TR[no_ay(a)] + " " + no_yil(a)).join(", ");
        uyarilar.splice(1, 0, "!!! DIKKAT: su aylarda PEK/gun bilgisi yok, kumulatif matraha "
          + "katilamadi (" + liste + "). Kumulatif oldugundan DUSUK kaldi, yani "
          + "vergi az, net YUKSEK, 1/4 de YUKSEK cikmis olabilir. "
          + "Dokumu elden kontrol et.");
      }
    } else if (asg_ay === n) {
      uyarilar.unshift("MAAS KAYNAGI: " + n + " ayin " + n + "'inde SGK'ya bildirilen kazanc TAM "
        + "ASGARI UCRET. Rakam varsayim degil, dokumden okundu.");
    }

    let ham = 0.0;
    for (const k of kalemler) ham += k.tutar;
    const toplam = yuvarla2(ham);
    let borclandirma;
    if (dosya_borcu && dosya_borcu > 0) {
      borclandirma = Math.min(toplam, dosya_borcu);
    } else {
      borclandirma = toplam;
      uyarilar.push("Dosya borcu girilmedi; borclandirma toplamin tamami alindi.");
    }

    // Asgari ucret tablosu bayat mi? donem_bul() tanimli araligin ONCESI icin
    // hata veriyor ama SONRASI icin sessizce en son donemi donduruyor; tablo
    // guncellenmezse hesap eski (dusuk) rakamla yapilir ve kimse fark etmez.
    const sd = ayarlar.son_donem();
    const bayatSet = new Set();
    for (const k of kalemler) {
      if (k.yil > sd.yil) bayatSet.add(ay_no(k.yil, k.ay));
    }
    const bayat = Array.from(bayatSet).sort((a, b) => a - b);
    if (bayat.length) {
      const liste = bayat.map((a) => AYLAR_TR[no_ay(a)] + " " + no_yil(a)).join(", ");
      uyarilar.unshift("!!! ASGARI UCRET TABLOSU ESKI — TUTAR DUSUK CIKTI. "
        + "ayarlar.json'daki en yeni donem " + _ikiHane(sd.ay) + "/" + sd.yil + ". Su aylar o "
        + "donemin otesinde ve " + sd.yil + " rakamiyla hesaplandi: " + liste + ". "
        + "Ilgili yilin net asgari ucretini ve 1/4'unu ayarlar.json'a ekle, "
        + "hesabi tekrar calistir.");
    } else if (karar.yil > sd.yil) {
      uyarilar.unshift("UYARI: ayarlar.json'daki en yeni asgari ucret donemi "
        + _ikiHane(sd.ay) + "/" + sd.yil + ", bugun ise " + karar.yil + ". Bu hesap "
        + "etkilenmedi ama tablo guncellenmeli.");
    }

    return {
      kisi: kisi, isyeri: isyeri, teblig: teblig, karar: karar,
      kalemler: kalemler, toplam: toplam, dosya_borcu: dosya_borcu,
      borclandirma: borclandirma, calisma_bitisi: calisma_bitisi,
      halen_calisiyor: halen, uyarilar: uyarilar,
      pek_ay_sayisi: pek_ay, veri_yok_ay: yok_ay, kusur: kusur,
    };
  }

  // ------------------------------------------------------------------------
  // Tutanak metni
  // ------------------------------------------------------------------------

  // Ust uste ayni (gun, tutar, ceyrek, net_kaynak) olan aylari tek cumlede toplar.
  function _gruplandir(kalemler) {
    const gruplar = [];
    for (const k of kalemler) {
      const son = gruplar.length ? gruplar[gruplar.length - 1][0] : null;
      if (son && son.gun === k.gun && son.tutar === k.tutar
        && son.ceyrek === k.ceyrek && son.net_kaynak === k.net_kaynak) {
        gruplar[gruplar.length - 1].push(k);
      } else {
        gruplar.push([k]);
      }
    }
    return gruplar;
  }

  function _aylari_yaz(grup) {
    const adlar = grup.map((k) => k.ay_adi);
    if (adlar.length === 1) return adlar[0] + " ayından";
    if (adlar.length === 2) return adlar[0] + " ve " + adlar[1] + " aylarından";
    return adlar.slice(0, -1).join(", ") + " ve " + adlar[adlar.length - 1] + " aylarından";
  }

  // Kagittaki paragrafin aynisini uretir.
  function tutanak_metni(s) {
    const p = [];
    let onceki_ceyrek = null;
    for (const grup of _gruplandir(s.kalemler)) {
      const k = grup[0];
      if (k.ceyrek !== onceki_ceyrek) {
        if (k.net_kaynak === "pek") {
          // Bu ayin neti asgari ucret degil, SGK kazancindan hesaplandi;
          // cumle de bunu soylemeli. (Sayi dogruyken metnin yanlis kalmasi bu
          // dosyada bir kez yasandi, tekrarlanmasin.)
          p.push("SGK'ya bildirilen prime esas kazancına göre hesaplanan "
            + "net ücreti olan " + tl(k.net) + " TL'nin 1/4 ü "
            + tl(k.ceyrek) + " TL'den");
        } else {
          p.push(k.yil + " yılı asgari ücret tarifesi olan " + tl(k.net) + " TL'nin "
            + "1/4 ü " + tl(k.ceyrek) + " TL'den");
        }
        onceki_ceyrek = k.ceyrek;
      }
      const aylar = _aylari_yaz(grup);
      if (k.gun >= 30) {
        p.push(aylar + " " + tl(k.tutar) + " TL");
      } else {
        p.push(aylar + " " + k.gun + " günlük " + tl(k.tutar) + " TL");
      }
    }

    const bitis = s.halen_calisiyor ? "halen çalıştığı"
      : (s.calisma_bitisi + " tarihine kadar çalıştığı");

    // IIK 356 iki ayri kusuru da kapsiyor: cevap vermemek VEYA kesip
    // gondermemek. Hesap ikisinde de ayni; degisen sadece cumle.
    const kusur = s.kusur === "kesinti-yok"
      ? "müzekkeresi gereğince maaştan kesinti yapmadığı"
      : "müzekkeresine süresi içerisinde cevap vermediği";

    const bas = "Borçlunun maaşının haczi için yazılan " + tarih_str(s.teblig)
      + " tebliğ tarihli maaş haciz " + kusur + ", UYAP üzerinden "
      + "yapılan SGK sorgusunda borçlunun bu kurumda " + bitis + " anlaşılmakla "
      + "bugün itibariyle 3. Şahsın ";
    const orta = p.join(" ");
    // Dosya borcu girilmediyse "0,00 TL oldugu gorulmekle" YAZILMAZ -- olmayan
    // bir rakami belgeye "tespit edilmis" gibi yazmak yanlis olur.
    const borc_cumlesi = borc_girildi(s)
      ? (", dosya borcunun bugün tarihi itibari ile " + tl(s.dosya_borcu)
        + " TL olduğu görülmekle")
      : " görülmekle";
    const son = " TOPLAMDA " + tl(s.toplam) + " TL kesinti yapmadığı" + borc_cumlesi
      + " bugün tarihi itibariyle "
      + "faiz ve harç hariç " + tl(s.borclandirma) + " TL olarak borçlandırılmasına";
    return bas + orta + son;
  }

  // Ekran/Excel icin ay ay tablo satirlari.
  function ozet_satirlari(s) {
    return s.kalemler.map((k) =>
      [k.ay_adi + " " + k.yil, k.gun, tl(k.ceyrek), tl(k.tutar), k.aciklama]);
  }

  const disa = {
    AYLAR_TR: AYLAR_TR, KOL_ADI: KOL_ADI,
    tl: tl, tarih_str: tarih_str, tarih_coz: tarih_coz, tarih_no: tarih_no,
    para_coz: para_coz, buyuk_harf: buyuk_harf, kucuk_harf: kucuk_harf,
    ad_bicimle: ad_bicimle, daire_bicimle: daire_bicimle,
    borc_girildi: borc_girildi, ek_ilgi: ek_ilgi, ek_yonelme: ek_yonelme,
    Ayarlar: Ayarlar, kol_ozeti: kol_ozeti, kol_uyarisi: kol_uyarisi,
    isverenleri_listele: isverenleri_listele, isveren_etiket: isveren_etiket,
    hesapla: hesapla, tutanak_metni: tutanak_metni, ozet_satirlari: ozet_satirlari,
    ay_no: ay_no, no_yil: no_yil, no_ay: no_ay,
    _isveren_aylik_pek: _isveren_aylik_pek, _kumulatif_tablosu: _kumulatif_tablosu,
    _en_yuksek_isveren: _en_yuksek_isveren, _gruplandir: _gruplandir,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.Hesap = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
