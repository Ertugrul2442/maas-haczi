// Python'un decimal.Decimal'inin ihtiyacimiz kadarlik JS karsiligi.
//
// ⚠ NEDEN VAR: net_maas.py bastan sona Decimal kullaniyor (quantize,
// ROUND_HALF_UP, ROUND_DOWN). JS'te Decimal YOK, float ile yazilirsa
// kesintiler kurus kayar ve 60/60 ay tutan resmi net asgari ucret tutmaz.
// yuvarla.js'te olculen dersin aynisi: dilin hazir aracina guvenme.
//
// NEDEN decimal.js DEGIL: kutuphane repoda 30+ KB durur ve Python'un
// VARSAYILAN BAGLAMINI (prec=28, ROUND_HALF_EVEN) birebir tutturmak icin yine
// elle ayar gerekir. Ihtiyacimiz olan islem az: topla, cikar, carp, bol,
// kiyasla, kurusa yuvarla. Hepsi asagida, BigInt ile TAM sayi aritmetigi --
// yani float hatasi hic girmiyor.
//
// TEMSIL: sayi = u / 10^s  (u = BigInt katsayi, s = ondalik hane sayisi)
// Python'un exponent'iyle ayni sey; s = -exponent.
//
// OLCEK (scale) KURALLARI Python'unkiyle AYNI tutuldu, cunku ciktidaki
// basamak sayisi buna bagli:
//   topla/cikar -> s = max(s1, s2)      (Python: exponent = min)
//   carp        -> s = s1 + s2
//   bol         -> 28 anlamli haneye ROUND_HALF_EVEN (Python varsayilan baglam)
//
// DOGRULANDI (09.09.2026): web/kiyas_net_maas.js ile Python'a karsi tarandi.
// 770 dort islem + 42 yuvarlama kiyasinin hepsinde DEGER birebir ayni; 182
// bolmenin 86'si kusuratli (28 haneye yuvarlanan) ve onlar da tutuyor.
//
// YUKLEME: hem Node'da (require) hem tarayicida (<script src>) calisir.
// ES modul (import/export) BILEREK kullanilmadi: "file://" ile acildiginda
// tarayici ES modulu engelliyor, bu program ise flastan/yerel dosyadan da
// acilabilmeli.

(function (kok) {
  "use strict";

  const PREC = 28; // Python: decimal.getcontext().prec

  function _on(k) {
    return 10n ** BigInt(k);
  }

  function _mutlak(u) {
    return u < 0n ? -u : u;
  }

  function _basamak(u) {
    const a = _mutlak(u);
    return a === 0n ? 1 : a.toString().length;
  }

  // Anlamli haneye ROUND_HALF_EVEN. "yapisik" (sticky) = atilan hanelerin
  // otesinde daha baska sifir olmayan hane VAR demek; tam yarim durumunu bozar.
  function _sig_yuvarla(u, s, prec, yapisik) {
    const eksi = u < 0n;
    const a = _mutlak(u);
    const dus = _basamak(a) - prec;
    if (dus <= 0) return [u, s]; // zaten yeterince kisa
    const p = _on(dus);
    let hi = a / p;
    const kalan = a % p;
    const yarim = p / 2n; // 10^n her zaman cift, tam bolunur
    if (kalan > yarim || (kalan === yarim && (yapisik || hi % 2n === 1n))) hi += 1n;
    return [eksi ? -hi : hi, s - dus];
  }

  // Metinden ayristir: "-1234.50", "0.15", "9", "1e-3" hepsi calisir.
  function _ayristir(metin) {
    let t = String(metin).trim();
    let eksi = false;
    if (t.startsWith("+")) t = t.slice(1);
    else if (t.startsWith("-")) {
      eksi = true;
      t = t.slice(1);
    }
    let us = 0;
    const e = t.search(/[eE]/);
    if (e >= 0) {
      us = parseInt(t.slice(e + 1), 10);
      t = t.slice(0, e);
    }
    const nokta = t.indexOf(".");
    let s = 0;
    if (nokta >= 0) {
      s = t.length - nokta - 1;
      t = t.slice(0, nokta) + t.slice(nokta + 1);
    }
    if (t.length === 0 || !/^[0-9]+$/.test(t)) {
      throw new Error("Sayiya cevrilemedi: " + metin);
    }
    let u = BigInt(t);
    s -= us;
    if (s < 0) {
      u *= _on(-s);
      s = 0;
    }
    return new Des(eksi ? -u : u, s);
  }

  class Des {
    constructor(u, s) {
      this.u = u; // BigInt katsayi
      this.s = s; // ondalik hane sayisi
    }

    // Iki sayiyi ayni olcege getir: [u1, u2, s]
    static _hizala(a, b) {
      const s = Math.max(a.s, b.s);
      return [a.u * _on(s - a.s), b.u * _on(s - b.s), s];
    }

    topla(o) {
      const [x, y, s] = Des._hizala(this, des(o));
      return new Des(...(_sig_yuvarla(x + y, s, PREC, false)));
    }

    cikar(o) {
      const [x, y, s] = Des._hizala(this, des(o));
      return new Des(...(_sig_yuvarla(x - y, s, PREC, false)));
    }

    carp(o) {
      const b = des(o);
      return new Des(...(_sig_yuvarla(this.u * b.u, this.s + b.s, PREC, false)));
    }

    // Python decimal bolmesi: sonuc 28 anlamli haneye ROUND_HALF_EVEN.
    // Bolme TAM cikiyorsa deger hic bozulmuyor (sadece sondaki sifirlar atiliyor).
    bol(o) {
      const b = des(o);
      if (b.u === 0n) throw new Error("sifira bolme");
      if (this.u === 0n) return new Des(0n, 0);
      const eksi = (this.u < 0n) !== (b.u < 0n);
      const n = _mutlak(this.u);
      const d = _mutlak(b.u);
      const kaydir = b.s - this.s; // deger = (n/d) * 10^kaydir
      // Bolumun en az PREC+2 anlamli hanesi cikacak kadar buyut:
      const k = Math.max(2, PREC + _basamak(d) - _basamak(n) + 2);
      const buyuk = n * _on(k);
      const q = buyuk / d;
      const kalan = buyuk % d;
      const [u, s] = _sig_yuvarla(q, k - kaydir, PREC, kalan !== 0n);
      return new Des(eksi ? -u : u, s);
    }

    // Belli ondalik haneye oturt. mod: "HALF_UP" | "DOWN" | "HALF_EVEN"
    // (Python: quantize(Decimal("0.01"), rounding=...))
    yuvarla(hane, mod) {
      if (this.s === hane) return new Des(this.u, this.s);
      if (this.s < hane) return new Des(this.u * _on(hane - this.s), hane);
      const dus = this.s - hane;
      const eksi = this.u < 0n;
      const a = _mutlak(this.u);
      const p = _on(dus);
      let hi = a / p;
      const kalan = a % p;
      const yarim = p / 2n;
      if (mod === "HALF_UP") {
        if (kalan >= yarim) hi += 1n; // sifirdan uzaga (Python ROUND_HALF_UP)
      } else if (mod === "HALF_EVEN") {
        if (kalan > yarim || (kalan === yarim && hi % 2n === 1n)) hi += 1n;
      } else if (mod !== "DOWN") {
        throw new Error("bilinmeyen yuvarlama: " + mod);
      }
      return new Des(eksi ? -hi : hi, hane);
    }

    kiyas(o) {
      const [x, y] = Des._hizala(this, des(o));
      return x < y ? -1 : x > y ? 1 : 0;
    }

    esit(o) {
      return this.kiyas(o) === 0;
    }

    kucuk(o) {
      return this.kiyas(o) < 0;
    }

    // Python'un str(Decimal)'i gibi: olcek korunur, sondaki sifirlar ATILMAZ.
    // Fark: Python cok buyuk/kucuk sayilarda ustel yazim kullanir (1E-7),
    // burada her zaman duz ondalik yazilir. Deger ayni, gosterim farkli --
    // ayrimi kiyas duzenegi ayrica olcuyor ve raporluyor.
    toString() {
      let u = this.u;
      let s = this.s;
      if (s < 0) {
        u *= _on(-s);
        s = 0;
      }
      const eksi = u < 0n;
      let t = _mutlak(u).toString();
      if (s === 0) return (eksi ? "-" : "") + t;
      if (t.length <= s) t = "0".repeat(s - t.length + 1) + t;
      const tam = t.slice(0, t.length - s);
      const kesir = t.slice(t.length - s);
      return (eksi ? "-" : "") + tam + "." + kesir;
    }

    // Sondaki sifirlar atilmis, isaretsiz sifirli hali -- iki tarafi DEGER
    // olarak kiyaslamak icin. Python tarafinda karsiligi:
    //     "0" if v == 0 else format(v.normalize(), "f")
    sade() {
      let u = this.u;
      let s = this.s;
      if (u === 0n) return "0";
      if (s < 0) {
        u *= _on(-s);
        s = 0;
      }
      while (s > 0 && u % 10n === 0n) {
        u /= 10n;
        s -= 1;
      }
      return new Des(u, s).toString();
    }

    sayi() {
      return Number(this.toString());
    }
  }

  // Her seyi Des'e cevir. Sayi verilirse String() ile -- Python'un str(float)'u
  // da en kisa gidis-donus gosterimini verir, ikisi ayni metni uretir.
  function des(x) {
    if (x instanceof Des) return x;
    if (typeof x === "bigint") return new Des(x, 0);
    return _ayristir(x);
  }

  function enkucuk(a, b) {
    return des(a).kiyas(des(b)) <= 0 ? des(a) : des(b);
  }

  const disa = { Des: Des, des: des, enkucuk: enkucuk, PREC: PREC };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.Desimal = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
