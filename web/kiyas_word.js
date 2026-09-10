// web/kiyas_word.py'nin urettigi senaryolari alir, AYNI tutanaklari
// web/disa_aktar.js ile uretip diske yazar. Kiyasi Python tarafi yapiyor
// (iki .docx'i de python-docx ile acip yapisal olarak karsilastiriyor).
//
//     node web/kiyas_word.js web/kiyas_word_dosya/senaryolar.json
//
// stdout'a SADECE JSON basar (punto ve sigar degerleri) -- Python onu
// okuyor, araya log karistirma.

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
  const p = DisaAktar.word_uret(s, g.bilgi, g.ek).then((r) => {
    fs.writeFileSync(path.join(calisma, "js", g.ad + ".docx"),
      Buffer.from(r.veri));
    cikti[g.ad] = { punto: r.punto, sigar: r.sigar };
  });
  isler.push(p);
}

Promise.all(isler).then(() => {
  process.stdout.write(JSON.stringify(cikti));
}).catch((e) => {
  process.stderr.write("JS tarafi patladi: " + e.stack + "\n");
  process.exit(1);
});
