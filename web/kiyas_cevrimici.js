// Sayfanin asgari ucret tablosunu INTERNETTEN guncellemesinin kiyasi.
//
// Beklenen degerleri web/kiyas_cevrimici.py uretir (masaustu motoruyla).
// Burada index.html GERCEK Chromium'da file:// ile aciliyor ve uc kaynak
// (GitHub / GitHub Pages / jsDelivr) playwright ile TAKLIT ediliyor: bazen
// internet yok, bazen yeni yil geliyor, bazen kurum aginin engelleme
// sayfasi, bazen bozuk tablo, bazen cevap hic gelmiyor.
//
// Olculen, "sayfa acildi" DEGIL, SONUC:
//   - internetten yeni yil gelince HESAP o rakamla mi yapiliyor
//     (masaustu motorunun ayni tabloyla verdigi toplamla birebir),
//   - bozuk / engellenmis cevap REDDEDILIYOR mu, sebebi ekrana yaziliyor mu,
//   - internet yokken dosyanin icindeki tabloya donuluyor ve SOYLENIYOR mu,
//   - cevap gec gelirse HESAPLA bekliyor mu (yoksa eski tabloyla hesaplar),
//   - dokum secildikten sonra disari HIC istek cikmiyor mu (mahremiyet).
//
//     py -3.13 web/kiyas_cevrimici.py > web/kiyas_cevrimici_veri.json
//     node web/kiyas_cevrimici.js web/kiyas_cevrimici_veri.json [--sayfa=...]

"use strict";

const fs = require("fs");
const path = require("path");
const url = require("url");

function playwrightBul() {
  const adaylar = [
    process.env.PLAYWRIGHT_YOLU,
    "playwright",
    "playwright-core",
    "C:/projeler/taskuyu/node_modules/playwright-core",
  ].filter(Boolean);
  for (const a of adaylar) {
    try { return { modul: require(a), nereden: a }; } catch (e) { /* sirayla dene */ }
  }
  console.error("HATA: playwright bulunamadi (PLAYWRIGHT_YOLU ile gosterilebilir).");
  process.exit(2);
}

let kiyas = 0;
const farklar = [];
function esit(senaryo, alan, cikan, beklenen) {
  kiyas += 1;
  if (JSON.stringify(cikan) !== JSON.stringify(beklenen)) {
    farklar.push({ senaryo, alan, cikan, beklenen });
  }
}
function icerir(senaryo, alan, metin, parca) {
  kiyas += 1;
  if (String(metin).indexOf(parca) < 0) {
    farklar.push({ senaryo, alan, cikan: metin, beklenen: "... " + parca + " ..." });
  }
}

const KAYNAK_ADRESI = {
  "GitHub": /raw\.githubusercontent\.com/,
  "GitHub Pages": /github\.io/,
  "jsDelivr": /cdn\.jsdelivr\.net/,
};

const ENGELLEME_SAYFASI = "<html><body><h1>Erişim Engellendi</h1>" +
  "<p>Bu siteye kurum politikası gereği erişilemez.</p></body></html>";

function bekle(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Bir kaynagin cevabini taklit eder.
async function cevapla(route, cevap) {
  if (cevap.tur === "kes") return route.abort();
  if (cevap.tur === "asili") return new Promise(() => {}); // hic cevap yok
  if (cevap.gecikme) await bekle(cevap.gecikme);
  const cors = { "access-control-allow-origin": "*" };
  if (cevap.tur === "html") {
    return route.fulfill({ status: 200, contentType: "text/html", body: ENGELLEME_SAYFASI, headers: cors });
  }
  return route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(cevap.veri), headers: cors });
}

async function hesapYap(p, v) {
  await p.setInputFiles("#dosya_girdi", v.dosya);
  await p.waitForFunction("window.UYGULAMA.kayitlar.length > 0", null, { timeout: 15000 });
  await p.fill("#teblig", v.teblig);
  await p.fill("#karar", v.karar);
  await p.waitForFunction((isyeri) => {
    const s = document.getElementById("isveren");
    return s && s.value && s.value.indexOf(isyeri) === 0;
  }, v.isyeri, { timeout: 5000 });
  const bekliyordu = await p.evaluate(() => window.UYGULAMA.guncelleme !== null);
  await p.click("#hesapla_dugme");
  const durumBasinca = await p.textContent("#durum_metni");
  try {
    await p.waitForFunction("window.UYGULAMA.sonuc !== null", null, { timeout: 20000 });
  } catch (e) {
    throw new Error("hesap sonucu gelmedi; durum: " + (await p.textContent("#durum_metni")));
  }
  const s = await sonucOku(p);
  return { s, bekliyordu, durumBasinca };
}

function sonucOku(p) {
  return p.evaluate(() => {
    const s = window.UYGULAMA.sonuc;
    return {
      toplam: s.toplam,
      borclandirma: s.borclandirma,
      kalemler: s.kalemler.map((k) => ({ yil: k.yil, ay: k.ay, gun: k.gun,
        ceyrek: k.ceyrek, net: k.net, tutar: k.tutar })),
      tablo_eski_uyarisi: s.uyarilar.some((u) => u.indexOf("TABLOSU ESKI") >= 0),
      ilk_uyari: s.uyarilar[0] || "",
    };
  });
}

function sonucKiyasla(ad, s, B) {
  esit(ad, "toplam", s.toplam, B.toplam);
  esit(ad, "borclandirma", s.borclandirma, B.borclandirma);
  esit(ad, "kalemler", s.kalemler, B.kalemler);
  esit(ad, "tablo_eski_uyarisi", s.tablo_eski_uyarisi, B.tablo_eski_uyarisi);
}

// ------------------------------------------------------------ ELLE GIRIS
// Tablo internetten gelemezse kullanici yeni donemi ELLE giriyor; kayit
// tarayicinin localStorage'inda. Olculen: kaydedilen rakam hesaba giriyor mu
// (masaustu motorunun AYNI tabloyla verdigi sonucla birebir), tarayici
// kapatilip acilinca duruyor mu, yanlis giris reddediliyor mu, resmi rakam
// gelince elle olan devre disi kaliyor mu, silinince eski hale donuluyor mu.
const ELLE_ANAHTAR = "maas_haczi.elle_asgari_ucret";

function elleDurum(p) {
  return p.evaluate((anahtar) => ({
    kullanilan: window.UYGULAMA.elle_kullanilan,
    ezilen: window.UYGULAMA.elle_ezilen.join(" | "),
    depo_hatasi: window.UYGULAMA.elle_depo_hatasi,
    kutu: document.getElementById("tablo_kaynagi").textContent,
    kayit: JSON.parse(localStorage.getItem(anahtar) || "[]"),
  }), ELLE_ANAHTAR);
}

// Pencereyi acar, alanlari doldurur, Kaydet'e basar. Onay ekranina
// gelinirse (ve istenirse) onaylar. Mesaj kutusunun son halini dondurur.
async function elleGir(p, g) {
  await p.click("#elle_dugme");
  if (g.duzelt) await p.click("#elle_duzelt_" + g.duzelt);
  if (g.donem !== undefined) await p.fill("#elle_donem", g.donem);
  if (g.brut !== undefined) await p.fill("#elle_brut", g.brut);
  const oneri = { net: await p.inputValue("#elle_net"), ceyrek: await p.inputValue("#elle_ceyrek") };
  if (g.net !== undefined) await p.fill("#elle_net", g.net);
  const oneri2 = { ceyrek: await p.inputValue("#elle_ceyrek") };
  const mesajlar = [];
  for (let i = 0; i < (g.kaydet_sayisi || 1); i++) {
    await p.click("#elle_kaydet");
    mesajlar.push({ sinif: await p.getAttribute("#elle_mesaj", "class"),
      metin: await p.textContent("#elle_mesaj") });
  }
  if (g.onayla) await p.click("#elle_onayla");
  else await p.evaluate(() => { const o = document.querySelector(".ortu"); if (o) o.remove(); });
  return { oneri, oneri2, mesajlar };
}

async function sayfaAc(baglam, sayfaYolu, cevaplar, hatalar) {
  await baglam.route(/^https?:\/\//, (route) => {
    const u = route.request().url();
    const ad = Object.keys(KAYNAK_ADRESI).find((k) => KAYNAK_ADRESI[k].test(u));
    return ad ? cevapla(route, cevaplar[ad]) : route.abort();
  });
  const p = await baglam.newPage();
  p.on("pageerror", (e) => hatalar.push("pageerror: " + e.message));
  await p.goto(sayfaYolu);
  await p.waitForFunction("window.UYGULAMA && window.UYGULAMA.guncelleme === null",
    null, { timeout: 20000 });
  return p;
}

async function elleSenaryolari(modul, tarayici, sayfaYolu, v) {
  const kes = { tur: "kes" };
  const internetsiz = { "GitHub": kes, "GitHub Pages": kes, "jsDelivr": kes };
  const sahte = { tur: "json", veri: v.sahte_tablo };
  const internetli = { "GitHub": sahte, "GitHub Pages": sahte, "jsDelivr": sahte };
  const S2027 = v.sahte_tablo.donemler[v.sahte_tablo.donemler.length - 1];
  const kayitli = (net, ceyrek) => [{ baslangic: "2027-01", net, ceyrek, brut: S2027.brut }];

  async function kos(ad, cevaplar, onYukle, fn) {
    const oncekiFark = farklar.length;
    const baglam = await tarayici.newContext();
    if (onYukle) {
      await baglam.addInitScript(([a, d]) => { localStorage.setItem(a, JSON.stringify(d)); },
        [ELLE_ANAHTAR, onYukle]);
    }
    const hatalar = [];
    try {
      const p = await sayfaAc(baglam, sayfaYolu, cevaplar, hatalar);
      await fn(p, ad);
    } catch (e) {
      farklar.push({ senaryo: ad, alan: "COKTU", cikan: String(e.message || e).split("\n")[0],
        beklenen: "senaryo tamamlanmali" });
    }
    esit(ad, "sayfa_hatasi_yok", hatalar, []);
    await baglam.close();
    console.log("  " + (farklar.length === oncekiFark ? "TAMAM " : "FARK  ") + ad);
  }

  // 1) Internet yok, kullanici 2027'yi elle giriyor -> hesap 2027 rakamiyla.
  await kos("elle:giris_internetsiz", internetsiz, null, async (p, ad) => {
    const r = await elleGir(p, { donem: "01/2027", brut: "35.294,12", onayla: true });
    esit(ad, "net_onerisi", r.oneri.net, "30.000,00");
    esit(ad, "ceyrek_onerisi", r.oneri.ceyrek, "7.500,00");
    esit(ad, "onay_ekrani", r.mesajlar[0].sinif, "elle-mesaj onay");
    const d = await elleDurum(p);
    esit(ad, "kullanilan", d.kullanilan, ["2027-01"]);
    esit(ad, "kayit", d.kayit.map((k) => [k.baslangic, k.brut, k.net, k.ceyrek]),
      [["2027-01", S2027.brut, S2027.net, S2027.ceyrek]]);
    icerir(ad, "kutu", d.kutu, "ELLE GİRİLEN asgari ücret kullanılıyor: 01/2027");
    const h = await hesapYap(p, v);
    sonucKiyasla(ad, h.s, v.beklenen.cevrimici);
    icerir(ad, "uyarilarin_basi", h.s.ilk_uyari, "ELLE GİRİLEN ASGARİ ÜCRET kullanıldı");
  });

  // 2) TARAYICI KAPATILIP ACILINCA kayit duruyor mu (kalici profil).
  {
    const ad = "elle:tarayici_kapanip_acilinca", oncekiFark = farklar.length;
    const dizin = fs.mkdtempSync(path.join(require("os").tmpdir(), "maas_elle_"));
    const hatalar = [];
    try {
      let c = await modul.chromium.launchPersistentContext(dizin, { headless: true });
      let p = await sayfaAc(c, sayfaYolu, internetsiz, hatalar);
      await elleGir(p, { donem: "01/2027", brut: "35.294,12", onayla: true });
      await c.close();
      c = await modul.chromium.launchPersistentContext(dizin, { headless: true });
      p = await sayfaAc(c, sayfaYolu, internetsiz, hatalar);
      esit(ad, "yeniden_acilista_kullanilan", (await elleDurum(p)).kullanilan, ["2027-01"]);
      sonucKiyasla(ad, (await hesapYap(p, v)).s, v.beklenen.cevrimici);
      await c.close();
    } catch (e) {
      farklar.push({ senaryo: ad, alan: "COKTU", cikan: String(e.message || e).split("\n")[0],
        beklenen: "senaryo tamamlanmali" });
    }
    esit(ad, "sayfa_hatasi_yok", hatalar, []);
    fs.rmSync(dizin, { recursive: true, force: true });
    console.log("  " + (farklar.length === oncekiFark ? "TAMAM " : "FARK  ") + ad);
  }

  // 3) Yanlis giris KAYDEDILMEZ.
  await kos("elle:yanlis_net_reddedilir", internetsiz, null, async (p, ad) => {
    const r = await elleGir(p, { donem: "01/2027", brut: "35.294,12", net: "3.000,00" });
    esit(ad, "mesaj_sinifi", r.mesajlar[0].sinif, "elle-mesaj hata");
    icerir(ad, "mesaj", r.mesajlar[0].metin, "net ile brüt birbirini tutmuyor");
    esit(ad, "kayit_yok", (await elleDurum(p)).kayit, []);
  });
  await kos("elle:belirsiz_sayi_sorulur", internetsiz, null, async (p, ad) => {
    const r = await elleGir(p, { donem: "01/2027", brut: "35.294" });
    icerir(ad, "mesaj", r.mesajlar[0].metin, "belirsiz");
    esit(ad, "kayit_yok", (await elleDurum(p)).kayit, []);
  });
  await kos("elle:resmi_donem_girilemez", internetsiz, null, async (p, ad) => {
    const r = await elleGir(p, { donem: "01/2026", brut: "33.030,00" });
    icerir(ad, "mesaj", r.mesajlar[0].metin, "resmi tabloda zaten var");
    esit(ad, "kayit_yok", (await elleDurum(p)).kayit, []);
  });

  // 4) Net 0,85'e uymuyor -> once UYARI, ikinci Kaydet'te kabul. Sonra
  //    Duzelt ile dogrusu giriliyor; ekrandaki sonuc KENDILIGINDEN tazelenmeli.
  await kos("elle:uyari_sonra_duzeltme", internetsiz, null, async (p, ad) => {
    const r = await elleGir(p, { donem: "01/2027", brut: "35.294,12", net: "29.000,00",
      kaydet_sayisi: 2, onayla: true });
    esit(ad, "ceyrek_netten_onerildi", r.oneri2.ceyrek, "7.250,00");
    esit(ad, "ilk_kaydet_uyari", r.mesajlar[0].sinif, "elle-mesaj uyari");
    icerir(ad, "uyari_metni", r.mesajlar[0].metin, "brüt × 0,85");
    esit(ad, "ikinci_kaydet_onay", r.mesajlar[1].sinif, "elle-mesaj onay");
    const once = (await hesapYap(p, v)).s;
    esit(ad, "yanlis_rakamla_toplam_farkli", once.toplam !== v.beklenen.cevrimici.toplam, true);
    const r2 = await elleGir(p, { duzelt: "2027-01", net: "30.000,00", onayla: true });
    esit(ad, "duzeltmede_eski_net", r2.oneri.net, "29.000,00");
    esit(ad, "duzeltmede_ceyrek_tazelendi", r2.oneri2.ceyrek, "7.500,00");
    sonucKiyasla(ad + "/duzeltme_sonrasi", await sonucOku(p), v.beklenen.cevrimici);
    esit(ad, "tek_kayit", (await elleDurum(p)).kayit.map((k) => [k.baslangic, k.net]),
      [["2027-01", 30000]]);
  });

  // 5) Elle 2027 girilmis, sonra internetten RESMI 2027 geliyor -> resmi kazanir.
  await kos("elle:resmi_gelince_kullanilmaz", internetli, kayitli(29500, 7375), async (p, ad) => {
    const d = await elleDurum(p);
    esit(ad, "kullanilan", d.kullanilan, []);
    icerir(ad, "ezilen", d.ezilen, "RESMİ rakam kullanılıyor");
    icerir(ad, "kutu", d.kutu, "RESMİ rakam kullanılıyor");
    sonucKiyasla(ad, (await hesapYap(p, v)).s, v.beklenen.cevrimici);
  });

  // 6) Silinince eski hale donulmeli; ekrandaki sonuc kendiliginden tazelenmeli.
  await kos("elle:silinince_eski_tablo", internetsiz, kayitli(30000, 7500), async (p, ad) => {
    sonucKiyasla(ad + "/silmeden_once", (await hesapYap(p, v)).s, v.beklenen.cevrimici);
    await p.click("#elle_dugme");
    await p.click("#elle_sil_2027-01");
    await p.click("#elle_sil_evet");
    const d = await elleDurum(p);
    esit(ad, "kullanilan", d.kullanilan, []);
    esit(ad, "kayit", d.kayit, []);
    sonucKiyasla(ad + "/sildikten_sonra", await sonucOku(p), v.beklenen.gomulu);
  });

  // 7) Tarayici kayit tutamiyor (localStorage yasak) -> SOYLE, bu acilista kullan.
  {
    const ad = "elle:tarayici_kayit_tutamiyor", oncekiFark = farklar.length;
    const baglam = await tarayici.newContext();
    await baglam.addInitScript(() => {
      Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
    });
    const hatalar = [];
    try {
      const p = await sayfaAc(baglam, sayfaYolu, internetsiz, hatalar);
      await elleGir(p, { donem: "01/2027", brut: "35.294,12", onayla: true });
      const d = await elleDurum(p);
      esit(ad, "bu_acilista_kullanilan", d.kullanilan, ["2027-01"]);
      icerir(ad, "kutu", d.kutu, "SADECE bu açılışta geçerli");
      sonucKiyasla(ad, (await hesapYap(p, v)).s, v.beklenen.cevrimici);
    } catch (e) {
      farklar.push({ senaryo: ad, alan: "COKTU", cikan: String(e.message || e).split("\n")[0],
        beklenen: "senaryo tamamlanmali" });
    }
    esit(ad, "sayfa_hatasi_yok", hatalar, []);
    await baglam.close();
    console.log("  " + (farklar.length === oncekiFark ? "TAMAM " : "FARK  ") + ad);
  }
}

function senaryolar(v) {
  const hepsi = (cevap) => ({ "GitHub": cevap, "GitHub Pages": cevap, "jsDelivr": cevap });
  const kes = { tur: "kes" };
  const gomulu = { tur: "json", veri: v.gomulu_tablo };
  const sahte = { tur: "json", veri: v.sahte_tablo };
  const L = [
    { ad: "internetsiz", cevaplar: hepsi(kes), kaynak: "gömülü", sinif: "yedek",
      metin: ["ulaşılamadı", "dosyanın içindeki tablo"], notlar: ["GitHub: ulaşılamadı",
      "GitHub Pages: ulaşılamadı", "jsDelivr: ulaşılamadı"], son: "2026-01", hesap: "gomulu" },
    { ad: "yeni_yil_geldi", cevaplar: hepsi(sahte), kaynak: "GitHub", sinif: "guncel",
      metin: ["GÜNCELLENDİ", "01/2027 eklendi"], son: "2027-01", hesap: "cevrimici" },
    { ad: "tablo_ayni", cevaplar: hepsi(gomulu), kaynak: "GitHub", sinif: "guncel",
      metin: ["Asgari ücret tablosu güncel"], son: "2026-01", hesap: "gomulu" },
    { ad: "engelleme_sayfasi", cevaplar: hepsi({ tur: "html" }), kaynak: "gömülü",
      sinif: "yedek", notlar: ["GitHub: gelen şey tablo değil"], son: "2026-01", hesap: "gomulu" },
    { ad: "karisik_en_yeni_secilir",
      cevaplar: { "GitHub": kes, "GitHub Pages": gomulu, "jsDelivr": sahte },
      kaynak: "jsDelivr", sinif: "guncel", son: "2027-01", hesap: "cevrimici" },
    { ad: "bozuk_kaynak_atlanir",
      cevaplar: { "GitHub": { tur: "json", veri: v.bozuklar.net_brutten_buyuk.tablo },
        "GitHub Pages": kes, "jsDelivr": sahte },
      kaynak: "jsDelivr", sinif: "guncel", notlar: ["GitHub: REDDEDİLDİ"], son: "2027-01" },
    // Cevap gec geliyor, HESAPLA ondan ONCE basiliyor. Sayfa beklemezse hesap
    // gomulu tabloyla yapilir ve toplam 34.392,47 cikar -- yanlis.
    { ad: "gec_gelen_cevap_beklenir",
      cevaplar: hepsi({ tur: "json", veri: v.sahte_tablo, gecikme: 4000 }),
      kaynak: "GitHub", son: "2027-01", hesap: "cevrimici", erken: true },
    // Kurum proxy'si baglantiyi acik tutup hic cevap vermiyor. 10 sn sonra
    // o kaynak birakilmali, digerleri kullanilmali.
    { ad: "cevap_vermeyen_kaynak",
      cevaplar: { "GitHub": { tur: "asili" }, "GitHub Pages": kes, "jsDelivr": sahte },
      kaynak: "jsDelivr", notlar: ["GitHub: zaman aşımı"], son: "2027-01" },
  ];
  for (const [ad, b] of Object.entries(v.bozuklar)) {
    L.push({ ad: "bozuk:" + ad, cevaplar: hepsi({ tur: "json", veri: b.tablo }),
      kaynak: "gömülü", sinif: "yedek", notlar: ["REDDEDİLDİ", b.sebep], son: "2026-01" });
  }
  return L;
}

async function main() {
  const argv = process.argv.slice(2);
  const sayfaArg = argv.find((a) => a.indexOf("--sayfa=") === 0);
  const sayfaAdi = sayfaArg ? sayfaArg.slice("--sayfa=".length) : "index.html";
  const veriYolu = argv.find((a) => a.indexOf("--") !== 0) ||
    path.join(__dirname, "kiyas_cevrimici_veri.json");
  const v = JSON.parse(fs.readFileSync(veriYolu, "utf8"));
  const sayfaYolu = url.pathToFileURL(
    path.isAbsolute(sayfaAdi) ? sayfaAdi : path.join(__dirname, sayfaAdi)).href;
  const { modul, nereden } = playwrightBul();

  console.log("=".repeat(72));
  console.log("CEVRIMICI TABLO KIYASI - sayfa internetten tabloyu dogru mu aliyor");
  console.log("playwright: " + nereden);
  console.log("sayfa     : " + sayfaYolu);
  console.log("=".repeat(72));

  const tarayici = await modul.chromium.launch();
  for (const sn of senaryolar(v)) {
    const oncekiFark = farklar.length;
    const baglam = await tarayici.newContext();
    const istekler = [];
    let evre = "acilis";
    await baglam.route(/^https?:\/\//, (route) => {
      const u = route.request().url();
      istekler.push({ evre, u });
      const ad = Object.keys(KAYNAK_ADRESI).find((k) => KAYNAK_ADRESI[k].test(u));
      if (!ad) return route.abort();
      return cevapla(route, sn.cevaplar[ad]);
    });
    const p = await baglam.newPage();
    const hatalar = [];
    p.on("pageerror", (e) => hatalar.push("pageerror: " + e.message));
    p.on("console", (m) => {
      // Kesilen istegin "Failed to load resource" satiri beklenen gurultu.
      if (m.type() === "error" && m.text().indexOf("Failed to load resource") < 0) {
        hatalar.push("console: " + m.text());
      }
    });

    try {
      await p.goto(sayfaYolu);
      let h = null;
      if (sn.hesap && sn.erken) {
        evre = "dosya_sonrasi";
        h = await hesapYap(p, v);
        esit(sn.ad, "hesaplaya_basinca_tablo_bekleniyordu", h.bekliyordu, true);
        icerir(sn.ad, "basinca_durum", h.durumBasinca, "bekleniyor");
      }
      await p.waitForFunction("window.UYGULAMA && window.UYGULAMA.guncelleme === null",
        null, { timeout: 20000 });

      const g = await p.evaluate(() => {
        const S = window.UYGULAMA, son = S.ayarlar.donemler[S.ayarlar.donemler.length - 1];
        const k = document.getElementById("tablo_kaynagi");
        return { kaynak: S.tablo_kaynagi, sinif: k.className, metin: k.textContent,
          notlar: S.cevrimici_notlar.join(" | "),
          son: son.yil + "-" + (son.ay < 10 ? "0" : "") + son.ay };
      });
      esit(sn.ad, "tablo_kaynagi", g.kaynak, sn.kaynak);
      esit(sn.ad, "kullanilan_son_donem", g.son, sn.son);
      if (sn.sinif) esit(sn.ad, "kutu_rengi", g.sinif, "tablo-kaynagi " + sn.sinif);
      (sn.metin || []).forEach((m) => icerir(sn.ad, "kutu_metni", g.metin, m));
      (sn.notlar || []).forEach((m) => icerir(sn.ad, "kaynak_notlari", g.notlar, m));
      esit(sn.ad, "acilista_istek_sayisi", istekler.filter((i) => i.evre === "acilis").length, 3);

      if (sn.hesap) {
        if (!h) {
          evre = "dosya_sonrasi";
          h = await hesapYap(p, v);
        }
        sonucKiyasla(sn.ad, h.s, v.beklenen[sn.hesap]);
        // MAHREMIYET: dokum secildikten sonra disari tek istek cikmamali.
        esit(sn.ad, "dokumden_sonra_istek", istekler.filter((i) => i.evre === "dosya_sonrasi")
          .map((i) => i.u), []);
      }
    } catch (e) {
      farklar.push({ senaryo: sn.ad, alan: "COKTU", cikan: String(e.message || e).split("\n")[0],
        beklenen: "senaryo tamamlanmali" });
    }
    esit(sn.ad, "sayfa_hatasi_yok", hatalar, []);
    await baglam.close();
    console.log("  " + (farklar.length === oncekiFark ? "TAMAM " : "FARK  ") + sn.ad);
  }
  await elleSenaryolari(modul, tarayici, sayfaYolu, v);
  await tarayici.close();

  console.log("-".repeat(72));
  for (const f of farklar) {
    console.log("FARK  " + f.senaryo + " / " + f.alan);
    console.log("      cikan   : " + JSON.stringify(f.cikan).slice(0, 300));
    console.log("      beklenen: " + JSON.stringify(f.beklenen).slice(0, 300));
  }
  console.log(kiyas + " kiyas, " + farklar.length + " fark.");
  process.exit(farklar.length ? 1 : 0);
}

main().catch((e) => { console.error("KIYAS COKTU: " + (e.stack || e)); process.exit(1); });
