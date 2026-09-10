// web/kiyas_excel.py'nin urettigi senaryolari alir, AYNI hesap tablolarini
// web/disa_aktar.js ile uretip diske yazar. Kiyasi Python tarafi yapiyor
// (iki .xlsx'i de openpyxl ile acip hucre hucre karsilastiriyor).
//
//     node web/kiyas_excel.js web/kiyas_excel_dosya/senaryolar.json
//
// stdout'a SADECE JSON basar -- Python onu okuyor, araya log karistirma.

"use strict";

const fs = require("fs");
const path = require("path");
const Hesap = require("./hesap.js");
const DisaAktar = require("./disa_aktar.js");

const veriYolu = process.argv[2];
const veri = JSON.parse(fs.readFileSync(veriYolu, "utf8"));
const calisma = path.dirname(veriYolu);

const ayarlar = Hesap.Ayarlar.kur(
  fs.readFileSync(path.join(__dirname, "..", "ayarlar.json"), "utf8"));

const cikti = {};
const isler = [];

for (const g of veri.senaryolar) {
  const s = Hesap.hesapla(g.kayitlar, g.isyeri, g.teblig, g.karar, g.borc,
    ayarlar, g.kisi, g.kusur);
  const p = DisaAktar.excel_uret(s, g.bilgi).then((r) => {
    fs.writeFileSync(path.join(calisma, "js", g.ad + ".xlsx"),
      Buffer.from(r.veri));
    cikti[g.ad] = { kalem: s.kalemler.length };
  });
  isler.push(p);
}

Promise.all(isler).then(() => {
  process.stdout.write(JSON.stringify(cikti));
}).catch((e) => {
  process.stderr.write("JS tarafi patladi: " + e.stack + "\n");
  process.exit(1);
});
