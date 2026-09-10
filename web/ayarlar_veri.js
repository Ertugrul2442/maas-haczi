// URETILEN DOSYA -- ELLE DEGISTIRME.
//
// Kaynak: ayarlar.json (depo kokunde). Bu dosya onun birebir kopyasidir ve
//     node web/ayarlar_uret.js
// ile yeniden uretilir. Yeni yilin asgari ucretini ayarlar.json'a ekle,
// sonra bu komutu calistir.
//
// Neden kopya var: "file://" ile acilan sayfada tarayici fetch'i engelliyor
// (olculdu), yani flastan acilan surum ayarlar.json'u okuyamaz. Ayrinti:
// web/ayarlar_uret.js basindaki yorum.
//
// Iki kopyanin ayrisip ayrismadigini CI her itiste olcuyor:
//     node web/ayarlar_uret.js --kontrol

(function (kok) {
  "use strict";
  const veri = {
    "_aciklama": "Net asgari ucret donemleri. 'ceyrek' yazilirsa program onu aynen kullanir; yazilmazsa net * oran hesaplar. Gercek bir icra dairesinin 2026 tarihli tutanaginda 2026 icin 7018.87 kullanilmis (matematiksel yuvarlama 7018.88 verir) - bu yuzden elle yazildi.",
    "ay_gun": 30,
    "oran": 0.25,
    "donemler": [
      {
        "baslangic": "2021-01",
        "net": 2825.9,
        "brut": 3577.5
      },
      {
        "baslangic": "2022-01",
        "net": 4253.4,
        "brut": 5004
      },
      {
        "baslangic": "2022-07",
        "net": 5500.35,
        "brut": 6471
      },
      {
        "baslangic": "2023-01",
        "net": 8506.8,
        "brut": 10008
      },
      {
        "baslangic": "2023-07",
        "net": 11402.32,
        "brut": 13414.5
      },
      {
        "baslangic": "2024-01",
        "net": 17002.12,
        "brut": 20002.5
      },
      {
        "baslangic": "2025-01",
        "net": 22104.67,
        "ceyrek": 5526.17,
        "brut": 26005.5
      },
      {
        "baslangic": "2026-01",
        "net": 28075.5,
        "ceyrek": 7018.87,
        "brut": 33030
      }
    ],
    "_aciklama2": "'brut' = o donemin BRUT asgari ucreti. Hesapta kullanilmaz; Excel'deki PEK sutunuyla kiyaslanip 'bu adam asgari ucretin ustunde mi bildirilmis' uyarisi vermek icin duruyor."
  };
  if (typeof module !== "undefined" && module.exports) module.exports = veri;
  else kok.AYARLAR_VERI = veri;
})(typeof globalThis !== "undefined" ? globalThis : this);
