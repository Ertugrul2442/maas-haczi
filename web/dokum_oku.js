// hesap.py'deki dokum_oku() ve yardimcilarinin BIREBIR portu -- SGK Uzun Vade
// Hizmet Dokumu (.xls) okuma.
//
// Masaustunde bu isi xlrd yapiyor, tarayicida SheetJS yapiyor. Iki kutuphane
// ayni dosyayi ayni sekilde okumak ZORUNDA degil; farklari burada elle
// kapatiliyor ve web/kiyas_dokum.js her koklu degisiklikte olcuyor.
//
// HAM DEGER: SheetJS'in her hucresinde iki alan var -- `v` ham deger, `w`
// bicimlenmis METIN. `w` yerel ayara gore "3.577,50" verir ve sayiya
// cevrilemez. Bu dosya HER YERDE `v` kullanir. (09.09.2026'da olculdu.)
//
// xlrd SAYISAL hucreyi float dondurur, hesap.py de ona str() uygular:
// str(1336786.0) -> "1336786.0" ama JS'te String(1336786) -> "1336786".
// Isyeri numarasi sayisal hucrede gelirse iki taraf AYRI anahtar uretir ve
// isveren listesi ikiye bolunur. O yuzden asagida _py_metin() Python'un
// str(float)'unu taklit ediyor. lll.xls'te butun hucreler METIN, yani bu yol
// gercek dosyada hic denenmiyor -- kiyasta sentetik olarak zorlaniyor.

(function (kok) {
  "use strict";

  const _H = (typeof require === "function")
    ? require("./hesap.js") : kok.Hesap;

  // Tarayicida SheetJS <script src> ile kuresel `XLSX` birakir; Node'da
  // require ile gelir. Yukleme aninda ARANMAZ -- bu dosya SheetJS'ten once
  // yuklenirse patlamasin diye cagri aninda bakiliyor.
  function _xlsx() {
    const x = (typeof XLSX !== "undefined") ? XLSX
      : (typeof kok.XLSX !== "undefined") ? kok.XLSX
        : (typeof require === "function") ? require("./lib/xlsx.full.min.js") : null;
    if (!x) {
      throw new Error("SheetJS (xlsx) yuklenmemis. Sayfada "
        + "lib/xlsx.full.min.js betigi var mi?");
    }
    return x;
  }

  const BASLIKLAR = {
    kol: "Sgrt. Kolu",
    ad: "Adı Soyadı",
    isyeri: "İşyeri",
    unite: "Ünite",
    donem: "Dönem",
    giris: "Giriş",
    gun: "Gün",
    pek: "PEK",
    cikis: "Çıkış",
    eksik: "Eksik Gün Nedeni",
  };

  // ------------------------------------------------------------------------
  // Python'un str() ve float()'unun taklidi
  // ------------------------------------------------------------------------

  // Python: str(<xlrd hucre degeri>)
  // xlrd bos hucreye '', metne str, sayiya float, mantiksala 0/1 (int) verir.
  function _py_metin(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v ? "1" : "0";   // xlrd int 1/0 dondurur
    if (typeof v === "number") {
      if (!isFinite(v)) return v > 0 ? "inf" : (v < 0 ? "-inf" : "nan");
      // Python str(float) tam sayilarda ".0" ekler: str(30.0) == "30.0"
      if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1);
      return String(v);
    }
    return String(v);
  }

  // Python: float(s) -- basarisizsa null.
  // Bilerek Python'dan DAR: "0x10" (JS'te 16, Python'da hata), "1_0" ve
  // "infinity" kabul edilmiyor. SGK dokumunde boyle deger yok; dar olmak
  // sessizce farkli sayi uretmekten iyidir.
  const _SAYI_KALIBI = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

  function _py_float(s) {
    if (!_SAYI_KALIBI.test(s)) return null;
    const f = Number(s);
    return isNaN(f) ? null : f;
  }

  // hesap.py._sayi
  function _sayi(v) {
    const s = _py_metin(v).trim();
    if (!s) return 0;
    const f = _py_float(s);
    if (f === null) return 0;          // Python: except ValueError -> 0
    return Math.trunc(f);              // Python: int(float(v))
  }

  // ------------------------------------------------------------------------
  // Sayfa erisimi -- xlrd'nin sh.cell_value(r, c) / nrows / ncols karsiligi
  // ------------------------------------------------------------------------

  function _sayfa(wb) {
    const X = _xlsx();
    const ad = wb.SheetNames[0];
    const sh = wb.Sheets[ad];
    if (!sh || !sh["!ref"]) {
      throw new Error("Dosyanin ilk sayfasi bos gorunuyor.");
    }
    const alan = X.utils.decode_range(sh["!ref"]);
    return {
      nrows: alan.e.r + 1,
      ncols: alan.e.c + 1,
      hucre: function (r, c) {
        const h = sh[X.utils.encode_cell({ r: r, c: c })];
        return h === undefined ? "" : _py_metin(h.v);
      },
    };
  }

  // ------------------------------------------------------------------------
  // hesap.py._sutunlari_bul
  // ------------------------------------------------------------------------

  function _sutunlari_bul(sh) {
    const ust = Math.min(sh.nrows, 60);
    for (let r = 0; r < ust; r++) {
      const satir = {};
      for (let c = 0; c < sh.ncols; c++) {
        const v = sh.hucre(r, c).trim();
        if (!v) continue;
        for (const anahtar of Object.keys(BASLIKLAR)) {
          if (!(anahtar in satir) && v.startsWith(BASLIKLAR[anahtar])) {
            satir[anahtar] = c;
          }
        }
      }
      if ("kol" in satir && "donem" in satir && "gun" in satir) return satir;
    }
    throw new Error(
      "SGK dokumunun baslik satiri bulunamadi. "
      + "Dosya gercekten 'SGK Uzun Vade Hizmet Dokumu' mu?");
  }

  // ------------------------------------------------------------------------
  // hesap.py.dokum_oku
  // ------------------------------------------------------------------------

  // Python'un re.match(r"^(\d{4})\s*/\s*(\d{1,2})$", donem) karsiligi.
  // Not: Python'un \d'si Unicode rakami da yakalar, JS'inki sadece ASCII.
  // SGK dokumunde ASCII disi rakam gorulmedi.
  const _DONEM_KALIBI = /^(\d{4})\s*\/\s*(\d{1,2})$/;

  // veri: ArrayBuffer / Uint8Array / Node Buffer -- .xls dosyasinin ham hali.
  // Doner: {kayitlar, ad, uyarilar}
  // (Python ucluyu tuple dondururken JS'te adlandirilmis alan daha guvenli.)
  function dokum_oku(veri) {
    const X = _xlsx();
    const bayt = (veri instanceof ArrayBuffer) ? new Uint8Array(veri) : veri;
    let wb;
    try {
      // cellText BILEREK kapatilmiyor: acik kalinca SheetJS her hucrenin
      // bicimlenmis metnini (`w`) de uretiyor ve `w` yerine `v` kullandigimiz
      // web/kiyas_dokum.js tarafindan KANITLANABILIYOR. Kapatsak `w`
      // hic uretilmez, kiyas da `.v` kullandigimizi olcemez -- sadece
      // varsayardi. (10.09.2026'da mutasyon testiyle olculdu: kapaliyken
      // ".v yerine .w" mutasyonu HIC yakalanmiyordu.)
      wb = X.read(bayt, { type: "array", cellDates: false });
    } catch (e) {
      throw new Error("Dosya okunamadi (" + e.message + "). "
        + "Gercekten SGK dokumu (.xls / .xlsx) mu?");
    }
    const sh = _sayfa(wb);
    const sut = _sutunlari_bul(sh);

    const kayitlar = [];
    const uyarilar = [];
    let ad = "";
    let atlanan_toplam = 0;   // Python'da da sayiliyor ama kullanilmiyor

    for (let r = 0; r < sh.nrows; r++) {
      const kol = sh.hucre(r, sut.kol).trim();
      if (!kol) continue;
      // Yil ozeti satiri. DIKKAT: bu dal CIKTIYI DEGISTIRMIYOR -- "Toplam"
      // ile baslayan bir kol degeri zaten asagidaki 4a/4b/4c filtresine
      // takilir, atlanan_toplam da hicbir yerde okunmuyor (hesap.py'de de
      // oyle). 10.09.2026'da mutasyon testiyle olculdu: dal komple
      // kaldirildiginda 1227 kiyasin hicbiri degismiyor. Duruyor cunku
      // niyeti belgeliyor; birisi kol filtresini gevsetirse ise yarar.
      if (kol.toLowerCase().startsWith("toplam")) {
        atlanan_toplam += 1;
        continue;
      }
      if (kol !== "4a" && kol !== "4b" && kol !== "4c") continue;  // baslik tekrari

      const donem = sh.hucre(r, sut.donem).trim();
      const m = _DONEM_KALIBI.exec(donem);
      if (!m) {
        uyarilar.push("Satir " + (r + 1) + ": donem okunamadi ("
          + _repr(donem) + "), atlandi.");
        continue;
      }

      let isyeri = ("isyeri" in sut) ? sh.hucre(r, sut.isyeri).trim() : "";
      if (!isyeri && "unite" in sut) isyeri = sh.hucre(r, sut.unite).trim();

      const kisi = ("ad" in sut) ? sh.hucre(r, sut.ad).trim() : "";
      if (kisi && !ad) ad = kisi;

      let pek = 0.0;
      if ("pek" in sut) {
        const ham = sh.hucre(r, sut.pek).trim();
        const f = _py_float(ham || "0");
        pek = (f === null) ? 0.0 : f;     // Python: except ValueError -> 0.0
      }

      kayitlar.push({
        kol: kol,
        isyeri: isyeri,
        yil: parseInt(m[1], 10),
        ay: parseInt(m[2], 10),
        gun: _sayi(sh.hucre(r, sut.gun)),
        giris: ("giris" in sut) ? sh.hucre(r, sut.giris).trim() : "",
        cikis: ("cikis" in sut) ? sh.hucre(r, sut.cikis).trim() : "",
        eksik_neden: ("eksik" in sut) ? sh.hucre(r, sut.eksik).trim() : "",
        ad: kisi,
        pek: pek,
      });
    }

    if (!kayitlar.length) throw new Error("Dosyada hic hizmet kaydi bulunamadi.");

    // Dokumde 4a disi kol varsa dosya okunur okunmaz soyle -- hesap asamasina
    // kadar bekleme.
    const ku = _H.kol_uyarisi(kayitlar);
    if (ku) uyarilar.unshift(ku);
    return { kayitlar: kayitlar, ad: ad, uyarilar: uyarilar };
  }

  // Python'un repr()'i uyari metnine giriyor: repr('2021.8') tirnakli yazar.
  // Tirnak ve ters egik cizgi Python'da kacisli gosterilir, aynisi yapiliyor.
  function _repr(s) {
    const ic = s.replace(/\\/g, "\\\\");
    if (ic.indexOf("'") === -1) return "'" + ic + "'";
    if (ic.indexOf('"') === -1) return '"' + ic + '"';
    return "'" + ic.replace(/'/g, "\\'") + "'";
  }

  const disa = {
    BASLIKLAR: BASLIKLAR,
    dokum_oku: dokum_oku,
    _sutunlari_bul: _sutunlari_bul,
    _sayfa: _sayfa,
    _sayi: _sayi,
    _py_metin: _py_metin,
    _py_float: _py_float,
    _repr: _repr,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.DokumOku = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
