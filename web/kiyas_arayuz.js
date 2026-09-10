// web/index.html'i GERCEK BIR TARAYICIDA file:// ile acar ve ekranda ne
// gordugunu masaustu arayuzun (arayuz.py) yazacagi seyle alan alan kiyaslar.
//
// Beklenen degerleri web/kiyas_arayuz.py uretir; oradaki uzun yorum bu
// kiyasin NEDEN ayri bir sey oldugunu anlatiyor (motor kiyasi "ayni sayi mi"
// sorusunu cevapliyor, bu ise "motor dogru baglanmis mi" sorusunu).
//
// file:// bilerek kullaniliyor: program adliyede flastan da acilabilmeli, ve
// tarayicinin orada uyguladigi kisitlar (fetch yasak, ES modul yasak) ancak
// boyle olculur. Sunucudan servis edilseydi kiyas yesil yanar, flasta ise
// program acilmazdi.
//
// Kullanim:
//     py -3.13 web/kiyas_arayuz.py > web/kiyas_arayuz_veri.json
//     node web/kiyas_arayuz.js web/kiyas_arayuz_veri.json
//
// playwright bu depoda bagimlilik DEGIL (kurulum agirlik yapmasin diye).
// Bulunamazsa kiyas "atlandi" demiyor, HATA verip cikiyor -- sessizce
// atlanan bir kiyas, olmayan kiyastan daha tehlikelidir.

"use strict";

const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");

// --------------------------------------------------------------- playwright
function playwrightBul() {
  const adaylar = [
    process.env.PLAYWRIGHT_YOLU,
    "playwright",
    "playwright-core",
    "C:/projeler/taskuyu/node_modules/playwright-core",
  ].filter(Boolean);
  for (const a of adaylar) {
    try {
      return { modul: require(a), nereden: a };
    } catch (e) { /* sirayla dene */ }
  }
  console.error("HATA: playwright bulunamadi. Denenen yerler:");
  adaylar.forEach((a) => console.error("   " + a));
  console.error("Kurmak icin:  npm i -D playwright-core  (ve chromium indir)");
  console.error("Ya da PLAYWRIGHT_YOLU cevre degiskenine yolunu yaz.");
  process.exit(2);
}

// ------------------------------------------------------------------- kiyas
let kiyas = 0;
const farklar = [];

function esit(senaryo, alan, cikan, beklenen) {
  kiyas += 1;
  const a = JSON.stringify(cikan);
  const b = JSON.stringify(beklenen);
  if (a !== b) farklar.push({ senaryo, alan, cikan, beklenen });
}

// Uzun metinleri satir satir kiyasla -- "tutanak farkli" demek yerine
// HANGI satirin farkli oldugunu soylesin.
function esitMetin(senaryo, alan, cikan, beklenen) {
  if (cikan === beklenen) { kiyas += 1; return; }
  const c = String(cikan).split("\n");
  const b = String(beklenen).split("\n");
  const n = Math.max(c.length, b.length);
  for (let i = 0; i < n; i++) {
    esit(senaryo, alan + " satir " + (i + 1), c[i], b[i]);
  }
}

// --------------------------------------------------------- sayfadan okuma
// Tarayicinin icinde kosar. DOM'u masaustu tablonun bicimine cevirir.
const OKU = `(() => {
  const metin = (s) => {
    const e = document.querySelector(s);
    return e ? e.textContent : null;
  };
  const satirlar = Array.from(document.querySelectorAll("#tablo_govde tr"))
    .map((tr) => ({
      sinif: tr.className,
      // Boslu ayirici satir tek bir colspan hucresi -- masaustunde de
      // icerigi yok, sadece varligi onemli.
      hucreler: tr.className === "bosluk"
        ? []
        : Array.from(tr.children).map((td) => td.textContent),
    }));
  return {
    durum: metin("#durum_metni"),
    durum_hata: document.getElementById("durum").className === "hata",
    isverenler: Array.from(document.querySelectorAll("#isveren option"))
      .map((o) => o.value),
    secili: document.getElementById("isveren").value,
    kayit_sayisi: window.UYGULAMA.kayitlar.length,
    kisi: window.UYGULAMA.kisi,
    satirlar: satirlar,
    tutanak: metin("#tutanak_metni"),
    uyarilar: Array.from(document.querySelectorAll("#uyari_kutusu div"))
      .map((d) => d.textContent),
    kurulum_hatasi: !document.getElementById("kurulum_hatasi")
      .classList.contains("yok"),
    ortu_basligi: document.querySelector(".ortu h3")
      ? document.querySelector(".ortu h3").textContent : null,
  };
})()`;

// Inen .docx'in butun <w:p>'lerini belge sirasiyla metne cevirir.
// Python tarafi AYNI tanimi kullaniyor (body.iter(qn("w:p"))), yani tablo
// icindeki paragraflar da dahil. OOXML'de <w:p> ic ice gecmez (metin
// kutusu kullanmiyoruz), o yuzden tembel eslesme guvenli.
async function docxParagraflari(yol) {
  const JSZip = require(path.join(__dirname, "lib", "jszip.min.js"));
  const zip = await JSZip.loadAsync(fs.readFileSync(yol));
  const xml = await zip.file("word/document.xml").async("string");
  const paragraflar = [];
  const pRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = pRe.exec(xml)) !== null) {
    const ic = m[1] || "";
    let metin = "";
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let t;
    while ((t = tRe.exec(ic)) !== null) metin += t[1];
    paragraflar.push(metin
      .split("&lt;").join("<").split("&gt;").join(">")
      .split("&quot;").join('"').split("&apos;").join("'")
      .split("&amp;").join("&"));
  }
  return paragraflar;
}

// Alani temizleyip metni HARF HARF yazar; odagi alanda birakir.
async function yaz(p, secici, metin) {
  const l = p.locator(secici);
  await l.fill("");
  await l.pressSequentially(metin, { delay: 1 });
}

// -------------------------------------------------------------------- ana
async function main() {
  const argv = process.argv.slice(2);
  // --sayfa=... : mutasyon testi icin. Duzenegi sinamanin tek yolu onu
  // bilerek bozmak; bozuk kopya web/ altinda durmali ki goreli <script src>
  // yollari ayni calissin.
  const sayfaArg = argv.find((a) => a.indexOf("--sayfa=") === 0);
  const sayfaAdi = sayfaArg ? sayfaArg.slice("--sayfa=".length) : "index.html";
  const veriYolu = argv.find((a) => a.indexOf("--") !== 0) ||
    path.join(__dirname, "kiyas_arayuz_veri.json");
  const veri = JSON.parse(fs.readFileSync(veriYolu, "utf8"));
  const { modul, nereden } = playwrightBul();
  const sayfaYolu = url.pathToFileURL(path.join(__dirname, sayfaAdi)).href;

  console.log("=".repeat(72));
  console.log("ARAYUZ KIYASI - masaustu (arayuz.py) vs tarayici (index.html)");
  console.log("playwright: " + nereden);
  console.log("sayfa     : " + sayfaYolu);
  console.log("=".repeat(72));

  const tarayici = await modul.chromium.launch();

  for (const d of veri.durumlar) {
    const baglam = await tarayici.newContext({ acceptDownloads: true });
    const p = await baglam.newPage();
    const sayfaHatalari = [];
    p.on("pageerror", (e) => sayfaHatalari.push("pageerror: " + e.message));
    p.on("console", (m) => {
      if (m.type() === "error") sayfaHatalari.push("console: " + m.text());
    });

    await p.goto(sayfaYolu);
    const B = d.beklenen;

    // --- dosya yuklendi, tarihler HENUZ girilmedi
    await p.setInputFiles("#dosya_girdi", d.dosya);
    await p.waitForFunction("window.UYGULAMA.kayitlar.length > 0",
      null, { timeout: 15000 });
    let g = await p.evaluate(OKU);
    esit(d.ad, "kurulum_hatasi_yok", g.kurulum_hatasi, false);
    esit(d.ad, "kayit_sayisi", g.kayit_sayisi, B.kayit_sayisi);
    esit(d.ad, "kisi", g.kisi, B.kisi);
    esit(d.ad, "isverenler_tarihsiz", g.isverenler, B.isverenler_tarihsiz);
    esit(d.ad, "durum_tarihsiz", g.durum, B.durum_tarihsiz);

    // --- tarihler girildi
    //
    // BILEREK HARF HARF YAZILIYOR, fill() ile tek seferde degil. Sebep bu
    // projenin 6b numarali tuzagi: masaustunde alanlar "odak kaybi"na
    // baglanmisti ve kullanici tarihi yazip DOGRUDAN butona basinca liste
    // tazelenmemis oluyordu. fill() hem input hem change tetikler, yani o
    // hatayi GORMEZ; harf harf yazmak sadece input tetikler ve odak da
    // alanda kalir -- gercek kullanicinin yaptigi sey.
    await yaz(p, "#teblig", d.girdi.teblig);
    await yaz(p, "#karar", d.girdi.karar);
    g = await p.evaluate(OKU);
    esit(d.ad, "isverenler_tarihli", g.isverenler, B.isverenler_tarihli);
    esit(d.ad, "durum_tarihli", g.durum, B.durum_tarihli);

    // Isveren listesi beklendigi gibi degilse hesaba GECME: selectOption
    // "boyle bir secenek yok" diye patlar ve kiyas cokerek biter, oysa
    // fark zaten yukarida kaydedildi. Cokmek yerine duzgun rapor ver.
    const etiket = B.hesap_var
      ? B.isverenler_tarihli.find((e) => e.split(" ")[0] === d.girdi.isyeri)
      : null;
    const secilebilir = etiket && g.isverenler.indexOf(etiket) >= 0;
    if (B.hesap_var && !secilebilir) {
      esit(d.ad, "isyeri_listede_secilebilir", g.isverenler, [etiket]);
    }

    if (B.hesap_var && secilebilir) {
      await p.selectOption("#isveren", etiket);
      await p.fill("#borc", d.girdi.borc);
      await p.selectOption("#kusur", d.girdi.kusur);
      await p.click("#hesapla_dugme");

      g = await p.evaluate(OKU);
      esit(d.ad, "durum_hesap", g.durum, B.durum_hesap);
      esit(d.ad, "hesapta_hata_yok", g.durum_hata, false);
      esit(d.ad, "satir_sayisi", g.satirlar.length, B.satirlar.length);
      const n = Math.min(g.satirlar.length, B.satirlar.length);
      for (let i = 0; i < n; i++) {
        esit(d.ad, "satir " + (i + 1) + " sinif",
          g.satirlar[i].sinif, B.satirlar[i].sinif);
        esit(d.ad, "satir " + (i + 1) + " hucreler",
          g.satirlar[i].hucreler, B.satirlar[i].hucreler);
      }
      esitMetin(d.ad, "tutanak", g.tutanak, B.tutanak);
      esit(d.ad, "uyari_sayisi", g.uyarilar.length, B.uyarilar.length);
      const m = Math.min(g.uyarilar.length, B.uyarilar.length);
      for (let i = 0; i < m; i++) {
        esit(d.ad, "uyari " + (i + 1), g.uyarilar[i], B.uyarilar[i]);
      }

      // --- Word: indi mi, ADI dogru mu, ICI dogru mu
      // "Bir .docx indi" ile "dogru .docx indi" ayri sorular. Arayuz sonucu
      // ya da form bilgilerini yanlis gecirse ekranda hicbir sey degismez.
      //
      // Hesap patladiysa ekranda hata ortusu duruyor ve butona tiklanamiyor;
      // fark zaten kaydedildi, bosuna 20 saniye bekleyip cokme.
      if (g.durum_hata) {
        esit(d.ad, "word_indi", false, true);
        await baglam.close();
        console.log("  HATA   " + d.ad + "  (hesap patladi, Word denenmedi)");
        continue;
      }
      if (d.girdi.borclu_bos) await p.fill("#b_borclu", "");
      if (d.girdi.form) {
        const f = d.girdi.form;
        for (const anahtar of Object.keys(f)) {
          if (anahtar === "dosya_yil" || anahtar === "dosya_sira") continue;
          await p.fill("#b_" + anahtar, f[anahtar]);
        }
        // Dosya no iki kutu: yil 4 hane olunca imlecin KENDILIGINDEN sira
        // kutusuna atlamasi masaustunde ozellikle yapilmis bir davranis.
        await p.click("#b_dosya_yil");
        await p.locator("#b_dosya_yil").pressSequentially(f.dosya_yil,
          { delay: 1 });
        esit(d.ad, "dosya_no_imlec_atladi",
          await p.evaluate("document.activeElement.id"), "b_dosya_sira");
        await p.locator("#b_dosya_sira").pressSequentially(f.dosya_sira,
          { delay: 1 });
      }
      const indirmeSozu = p.waitForEvent("download", { timeout: 20000 })
        .catch(() => null);
      await p.click("#word_dugme");
      const indirme = await indirmeSozu;
      esit(d.ad, "word_indi", indirme !== null, true);
      if (indirme) {
        esit(d.ad, "word_dosya_adi", indirme.suggestedFilename(),
          B.word.dosya_adi);
        const gecici = path.join(os.tmpdir(),
          "kiyas_arayuz_" + Date.now() + ".docx");
        await indirme.saveAs(gecici);
        const paragraflar = await docxParagraflari(gecici);
        fs.unlinkSync(gecici);
        esit(d.ad, "word_paragraf_sayisi", paragraflar.length,
          B.word.paragraflar.length);
        const s = Math.min(paragraflar.length, B.word.paragraflar.length);
        for (let i = 0; i < s; i++) {
          esit(d.ad, "word paragraf " + (i + 1),
            paragraflar[i], B.word.paragraflar[i]);
        }
        // Durum cubugu dogru puntoyu bildiriyor mu.
        const gd = await p.evaluate(OKU);
        esit(d.ad, "durum_word", gd.durum,
          "Word indirildi (" + B.word.punto + " punto, tek sayfa): "
          + B.word.dosya_adi);
        // Tek sayfaya sigmadiysa SUSMAK YASAK -- uyari penceresi acilmali.
        esit(d.ad, "sigmadi_uyarisi", gd.ortu_basligi,
          B.word.sigar ? null : "Tek sayfaya sığmadı");
      }
    }

    esit(d.ad, "sayfa_hatasi_yok", sayfaHatalari, []);
    console.log("  " + (farklar.some((f) => f.senaryo === d.ad) ? "HATA " : "TAMAM")
      + "  " + d.ad + (d.kisisel ? "  (kisisel veri)" : ""));
    await baglam.close();
  }

  await tarayici.close();

  console.log("-".repeat(72));
  if (farklar.length) {
    console.log("FARKLAR (" + farklar.length + " tane, ilk 40):");
    farklar.slice(0, 40).forEach((f) => {
      console.log("  [" + f.senaryo + "] " + f.alan);
      console.log("      tarayici: " + JSON.stringify(f.cikan));
      console.log("      masaustu: " + JSON.stringify(f.beklenen));
    });
  }
  console.log(kiyas + " kiyas, " + farklar.length + " fark.");
  process.exit(farklar.length ? 1 : 0);
}

main().catch((e) => {
  console.error("KIYAS COKTU: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
