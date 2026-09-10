// disa_aktar.py'nin Word (.docx) kisminin portu -- python-docx yerine duz XML
// + JSZip.
//
// NEDEN KUTUPHANE YOK: python-docx'in paketi 832 KB ve bunun 787 KB'i onun
// HAZIR SABLONU (styles.xml 349 KB + stylesWithEffects.xml 438 KB). Asil
// icerik word/document.xml, sadece 7,4 KB ve duz XML. cdnjs'de docx diye bir
// kutuphane zaten yok. 09.09.2026'da olculdu: ayni document.xml JSZip ile
// 5 parcalik minimal iskelete konup Word'e saydirildi -> 1 sayfa, 345 kelime,
// 2275 karakter, python-docx'in 38 KB'lik ciktisiyla BIREBIR AYNI.
//
// ⚠ SAYFA OLCULERI PYTHON-DOCX'IN SABLONUNDAN GELIYOR, DEGISTIRME:
// python-docx'in bos sablonu LETTER (12240 x 15840 twip) ve satir araligi
// 1,15 (docDefaults'ta line=276, lineRule=auto). PUNTO_KADEME esikleri Word'e
// TAM BU olculerle saydirilarak bulundu (CLAUDE.md "tek sayfa" bolumu).
// Iskelet A4'e ya da tek satir araligina cevrilirse esikler gecersiz kalir ve
// tutanak sessizce 2. sayfaya tasar. O yuzden asagidaki sectPr ve docDefaults
// python-docx'in urettiginin birebir aynisi.
//
// ⚠ PARA/TARIH BICIMI hesap.js'ten geliyor (tl, tarih_str). Burada yeniden
// yazilmadi -- "sayi dogru, metin yanlis" hatasi bu projede uc kez yasandi.

(function (kok) {
  "use strict";

  const _H = (typeof require === "function")
    ? require("./hesap.js") : kok.Hesap;

  function _jszip() {
    const z = (typeof JSZip !== "undefined") ? JSZip
      : (typeof kok.JSZip !== "undefined") ? kok.JSZip
        : (typeof require === "function") ? require("./lib/jszip.min.js") : null;
    if (!z) {
      throw new Error("JSZip yuklenmemis. Sayfada lib/jszip.min.js betigi var mi?");
    }
    return z;
  }

  const tl = _H.tl;
  const tarih_str = _H.tarih_str;

  // ------------------------------------------------------------------------
  // disa_aktar.py'deki sabitlerin aynisi
  // ------------------------------------------------------------------------

  const GOVDE_PT = 10.5;      // en buyuk punto; icerik uzarsa asagi inilir
  const PARA_BOSLUK = 4;      // paragraf arasi bosluk (punto)
  const TABLO_PT = 8;         // ek sayfadaki hesap tablosu
  const KENAR_UST = 1.6;      // cm
  const KENAR_YAN = 2.0;      // cm

  // Esikler TAHMIN DEGIL -- her biri Word'un kendisine saydirildi.
  const PUNTO_KADEME = [[2900, 10.5], [3150, 10.0], [3650, 9.5], [4100, 9.0]];

  function punto_sec(karakter) {
    for (const [sinir, pt] of PUNTO_KADEME) {
      if (karakter <= sinir) return { punto: Math.min(pt, GOVDE_PT), sigar: true };
    }
    return { punto: Math.min(9.0, GOVDE_PT), sigar: false };
  }

  const KAYNAK_ADI = {
    "asgari": "SGK'da tam asgari ücret",
    "pek": "SGK kazancından hesaplanan net",
    "veri-yok": "!!! kazanç bilgisi yok, asgari ücret varsayıldı",
  };

  // ------------------------------------------------------------------------
  // Olcu birimleri -- python-docx neyi nasil yuvarliyorsa aynisi
  // ------------------------------------------------------------------------

  // python-docx: Cm(x) -> EMU (x * 360000), sonra twip = round(EMU / 635)
  function cm_twip(cm) { return Math.round((cm * 360000) / 635); }
  // Pt(x) -> twip: x * 12700 EMU / 635 = x * 20
  function pt_twip(pt) { return Math.round((pt * 12700) / 635); }
  // w:sz yarim punto cinsinden
  function pt_yarim(pt) { return Math.trunc(pt * 2); }

  // ------------------------------------------------------------------------
  // XML kacislari
  // ------------------------------------------------------------------------

  function _kacis(metin) {
    return String(metin)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function _oznitelik(metin) {
    return _kacis(metin).replace(/"/g, "&quot;");
  }

  // <w:t>. Bastaki/sondaki bosluk korunacaksa xml:space gerekiyor -- yoksa
  // Word onu kirpar ve "ORNEK LTD'ye 01.01.2026" gibi cumleler bitisir.
  function _t(metin) {
    if (metin === "") return "";
    const koru = (metin !== metin.replace(/^\s+|\s+$/g, ""));
    return "<w:t" + (koru ? " xml:space=\"preserve\"" : "") + ">"
      + _kacis(metin) + "</w:t>";
  }

  // ------------------------------------------------------------------------
  // Paragraf uretimi
  // ------------------------------------------------------------------------
  //
  // python-docx'in urettigi kalibin aynisi. Sira OOXML semasina bagli:
  // pageBreakBefore -> spacing -> ind -> jc. Bozarsan Word dosyayi
  // "onarilmasi gerekiyor" der.

  const HIZA = { SOL: "left", ORTA: "center", SAG: "right", IKI_YAN: "both" };

  function _paragraf(parcalar, hiza, ilk_satir, bosluk, sayfa_kirilmasi, punto_tablo) {
    let pPr = "<w:pPr>";
    if (sayfa_kirilmasi) pPr += "<w:pageBreakBefore/>";
    pPr += "<w:spacing w:after=\"" + pt_twip(bosluk) + "\" w:before=\"0\"/>";
    if (ilk_satir) pPr += "<w:ind w:firstLine=\"" + cm_twip(ilk_satir) + "\"/>";
    if (hiza) pPr += "<w:jc w:val=\"" + hiza + "\"/>";
    pPr += "</w:pPr>";

    let ic = "";
    for (const [metin, kalin] of parcalar) {
      // python-docx'te run.bold HER ZAMAN aciktan yaziliyor: True ise <w:b/>,
      // False ise <w:b w:val="0"/>. Bos metinli run'da <w:t> HIC olmuyor.
      let rPr = "<w:rPr>" + (kalin ? "<w:b/>" : "<w:b w:val=\"0\"/>");
      if (punto_tablo) rPr += "<w:sz w:val=\"" + pt_yarim(punto_tablo) + "\"/>";
      rPr += "</w:rPr>";
      ic += "<w:r>" + rPr + _t(metin) + "</w:r>";
    }
    return "<w:p>" + pPr + ic + "</w:p>";
  }

  // ------------------------------------------------------------------------
  // word_parcalari -- ZIPLENMEMIS hali. Saf fonksiyon, JSZip gerektirmez.
  // ------------------------------------------------------------------------

  function word_parcalari(s, bilgi, ek) {
    bilgi = bilgi || {};
    ek = Boolean(ek);
    const al = (a) => (bilgi[a] === undefined || bilgi[a] === null) ? "" : bilgi[a];

    // ---- IKI ASAMA. Punto icerik uzunluguna gore secilecegi icin metnin
    // TAMAMI once toplanir, sonra tek seferde yazilir. Yazarken secmek
    // mumkun degil: ilk paragrafi yazarken sonuncunun ne kadar uzun
    // olacagini bilmiyoruz.
    const islemler = [];   // {parcalar, hiza, ilk_satir, bosluk}

    function par(metin, kalin, hiza, ilk_satir, bosluk) {
      islemler.push({
        parcalar: [[metin === undefined ? "" : metin, Boolean(kalin)]],
        hiza: hiza === undefined ? HIZA.IKI_YAN : hiza,
        ilk_satir: ilk_satir || null,
        bosluk: bosluk === undefined || bosluk === null ? PARA_BOSLUK : bosluk,
      });
    }

    function par_cok(parcalar, hiza, ilk_satir, bosluk) {
      islemler.push({
        parcalar: parcalar,
        hiza: hiza === undefined ? HIZA.IKI_YAN : hiza,
        ilk_satir: ilk_satir || null,
        bosluk: bosluk === undefined || bosluk === null ? PARA_BOSLUK : bosluk,
      });
    }

    // Baslik. Kullanici kucuk harfle yazsa da belgeye BUYUK gider; icra
    // dairesine sadece "3" yazmasi yeter, "3. ICRA DAIRESI" olur.
    for (const satir of ["T.C.", _H.buyuk_harf(al("il")),
      _H.daire_bicimle(al("daire")), al("dosya_no")]) {
      if (satir) par(satir, true, HIZA.SOL);
    }

    par("", false, HIZA.IKI_YAN, null, 2);
    par("KARAR TENSİP TUTANAĞI", true, HIZA.ORTA);

    const borclu = _H.ad_bicimle(al("borclu") || s.kisi) || "borçlu";
    const isveren = al("isveren_adi") || (s.isyeri + " sicil numaralı işyeri");
    const ay_sayisi = s.kalemler.length;

    // Kusur cumlesi tutanak govdesiyle AYNI olmali; ikisi ayri yerde
    // uretiliyor, birini degistirip otekini unutmak "sayi dogru, metin yanlis"
    // demek. (Bu tuzak 02.09.2026'da bir kez yasandi.)
    const kusur_cumle = (s.kusur === "kesinti-yok")
      ? "Ancak müzekkere gereğince maaştan kesinti yapılmamıştır."
      : "Ancak herhangi bir cevap verilmemiştir.";

    par("Talep : Yukarıda dosya numarası yazılı bulunan dosyada dosyamız borçlusu "
      + _H.ek_ilgi(borclu) + " almakta olduğu maaşına haciz müzekkeresi yazılmış ve "
      + _H.ek_yonelme(isveren) + " " + tarih_str(s.teblig) + " tarihinde tebliğ olmuştur. "
      + kusur_cumle + " Buna göre " + ay_sayisi + " aylık işveren borçludur.",
      false, HIZA.IKI_YAN, 1.25);

    par("Genel olarak İ.İ.K. 355 VE 356 md. İ.İ.K. 356. md. 'Yukarıdaki madde "
      + "hükümlerine riayet etmemiş olanların kesmedikleri veya ilk vasıta ile "
      + "göndermedikleri para ayrıca mahkemeden hüküm alınmaksızın hacet kalmaksızın "
      + "icra dairesince maaşlarından ve sair mallarından alınır.' hükmü gereği maaş "
      + "tekit müzekkeresi tebliğ etme zorunluluğu olmayıp nitekim normal maaş haczi "
      + "tebliğ müzekkeresinde işverenin sorumluluğunda olan kesintilerin yapılmaması "
      + "halinde sorumlulukları tebliğ edilmiştir.", false, HIZA.IKI_YAN, 1.25);

    par("İşveren " + _H.ek_ilgi(isveren) + " dosyaya borçlu sıfatıyla eklenmesini,",
      false, HIZA.IKI_YAN, 1.25);
    par("- Sorgulama yapılabilmesi için kesinleştirme yapılmasını,", false, HIZA.SOL);
    par("- Adına kayıtlı araç ve Taşınmazlara haciz şerhi konulmasını talep ederim. "
      + tarih_str(s.karar), false, HIZA.SOL);
    par();

    par_cok([["Karar : ", true],
      ["Müdürlüğümüz takip dosyasına alacaklının gönderdiği talep dilekçesi "
        + "ve takip dosyası incelenmekle;", false]], HIZA.IKI_YAN, 1.25);

    // Kagitta bu paragraf 3. sahsin (isverenin) adiyla basliyor: isveren cevap
    // vermeyen taraf, "borclunun maasi" ise haczedilen maas.
    const govde = _H.tutanak_metni(s);
    par(_H.ek_ilgi(isveren) + " " + govde[0].toLowerCase() + govde.slice(1),
      false, HIZA.IKI_YAN, 1.25);

    par("3. Şahsın borçlu olarak eklenmesi yönündeki talebin kabulüne",
      false, HIZA.IKI_YAN, 1.25);
    par("* 3. Şahıs Borçlu ile ilgili gerekli sorgulamaların yapılmasına, sorguların "
      + "UYAP üzerinden dosyaya kaydedilmesine, adına kayıtlı olduğunun tespit "
      + "edilmesi ve dosyamızda masraf bulunmaması halinde yatırıldığında ve bu ilgili "
      + "yerlere istenilen müzekkerelerin yazılmasına, masraf bulunmaması halinde bu "
      + "durumun müdürlüğümüze talep ile bildirilmesi halinde bu yönde yeniden karar "
      + "alınmasına karar verildi.", false, HIZA.IKI_YAN, 1.25);
    par(tarih_str(s.karar), false, HIZA.SOL);
    par();

    if (al("personel")) {
      par("İşlemi Yapacak Personel : " + _H.ad_bicimle(al("personel")),
        true, HIZA.SOL);
    }
    par();
    for (const satir of [_H.ad_bicimle(al("imza_ad")), al("imza_unvan"),
      al("imza_sicil")]) {
      if (satir) par(satir, false, HIZA.SAG);
    }

    // ---- Asama 2: olc, punto sec, yaz
    let karakter = 0;
    for (const i of islemler) for (const [m] of i.parcalar) karakter += m.length;
    const { punto, sigar } = punto_sec(karakter);

    let govde_xml = "";
    for (const i of islemler) {
      govde_xml += _paragraf(i.parcalar, i.hiza, i.ilk_satir, i.bosluk, false, null);
    }

    if (ek) govde_xml += _ek_tablo(s);

    const belge = _BELGE_BAS + "<w:body>" + govde_xml + _sectPr() + "</w:body></w:document>";

    return {
      punto: punto,
      sigar: sigar,
      karakter: karakter,
      parcalar: {
        "[Content_Types].xml": _ICERIK_TURLERI,
        "_rels/.rels": _KOK_RELS,
        "word/document.xml": belge,
        "word/styles.xml": _stiller(punto),
        "word/_rels/document.xml.rels": _BELGE_RELS,
      },
    };
  }

  // ------------------------------------------------------------------------
  // Ek sayfadaki hesap dokumu tablosu
  // ------------------------------------------------------------------------

  // Sutun genislikleri ELLE veriliyor -- Word'un otomatigi 6 sutunu esit
  // bolusturuyor ve aciklama sutunu 8 satira yayilip tabloyu 3 sayfaya
  // cikariyordu (olculdu). Ilk sutun 2,6 cm iken "BORCLANDIRMA" ikiye
  // boluniyordu, 3,1 cm yapildi.
  const GENISLIK_CM = [3.1, 1.2, 2.8, 2.2, 2.4, 5.3];

  function _hucre(genislik_twip, metin, kalin) {
    const ic = (metin === null)
      ? "<w:p/>"     // python-docx'in dokunulmamis bos hucresi
      : _paragraf([[metin, Boolean(kalin)]], null, null, 0, false, TABLO_PT);
    return "<w:tc><w:tcPr><w:tcW w:type=\"dxa\" w:w=\"" + genislik_twip
      + "\"/></w:tcPr>" + ic + "</w:tc>";
  }

  function _ek_tablo(s) {
    // d.add_page_break() KULLANMA: ayri bir bos paragraf uretiyor, govde
    // sayfanin dibinde bitince o paragraf 2. sayfaya dusuyor ve kirilma
    // tabloyu 3. sayfaya atiyor -- arada BOMBOS bir sayfa kaliyor (olculdu,
    // PDF'e cevirilip gozle goruldu). Kirilma basligin kendi ustune konuyor.
    let x = _paragraf([["HESAP DÖKÜMÜ (ek)", true]], HIZA.ORTA, null,
      PARA_BOSLUK, true, null);

    x += "<w:tbl><w:tblPr><w:tblStyle w:val=\"TableGrid\"/>"
      + "<w:tblW w:type=\"auto\" w:w=\"0\"/><w:tblLayout w:type=\"fixed\"/>"
      + "<w:tblLook w:firstColumn=\"1\" w:firstRow=\"1\" w:lastColumn=\"0\" "
      + "w:lastRow=\"0\" w:noHBand=\"0\" w:noVBand=\"1\" w:val=\"04A0\"/>"
      + "</w:tblPr><w:tblGrid>";
    // DIKKAT: sabit duzende Word <w:gridCol> genisligini esas aliyor; sadece
    // hucre (tcW) genisligini yazmak YETMIYOR -- olculdu, tablo yine 6 esit
    // sutuna bolunup 3 sayfaya yayiliyordu. Ikisi birden yaziliyor.
    for (const g of GENISLIK_CM) x += "<w:gridCol w:w=\"" + cm_twip(g) + "\"/>";
    x += "</w:tblGrid>";

    // Sutun basligi "Asgari ucret 1/4" DEGIL: net, o ayin SGK kazancindan da
    // gelmis olabilir. Hangi aya hangi maasin esas alindigi "Net esasi"
    // sutununda yaziyor -- sayi dogruyken metin yanlis kalmasin.
    const basliklar = ["Ay", "Gün", "Esas alınan net maaş", "1/4",
      "Tutar (TL)", "Net esası / açıklama"];
    let tr = "<w:tr>";
    for (let i = 0; i < 6; i++) {
      tr += _hucre(cm_twip(GENISLIK_CM[i]), basliklar[i], true);
    }
    x += tr + "</w:tr>";

    for (const k of s.kalemler) {
      const degerler = [
        k.ay_adi + " " + k.yil, String(k.gun), tl(k.net), tl(k.ceyrek), tl(k.tutar),
        (KAYNAK_ADI[k.net_kaynak] || "") + (k.aciklama ? " · " + k.aciklama : ""),
      ];
      let r = "<w:tr>";
      for (let i = 0; i < 6; i++) {
        r += _hucre(cm_twip(GENISLIK_CM[i]), degerler[i], false);
      }
      x += r + "</w:tr>";
    }

    // Dosya borcu girilmediyse tabloya "0,00" YAZILMAZ -- belgede olmayan bir
    // tespit gibi durur. Sadece TOPLAM ve BORCLANDIRMA gosterilir.
    const ozet = [["TOPLAM", s.toplam]];
    if (_H.borc_girildi(s)) ozet.push(["Dosya borcu", s.dosya_borcu]);
    ozet.push(["BORÇLANDIRMA", s.borclandirma]);

    for (const [etiket, deger] of ozet) {
      // python-docx tarafinda yalniz 1. ve 5. hucreye yazi giriyor, digerleri
      // dokunulmamis bos paragraf olarak kaliyor (<w:p/>). Birebir ayni.
      const degerler = [etiket, null, null, null, tl(deger), null];
      let r = "<w:tr>";
      for (let i = 0; i < 6; i++) {
        r += _hucre(cm_twip(GENISLIK_CM[i]), degerler[i], true);
      }
      x += r + "</w:tr>";
    }

    return x + "</w:tbl>";
  }

  // ------------------------------------------------------------------------
  // Sabit XML parcalari
  // ------------------------------------------------------------------------

  const _XML_BAS = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n";

  const _BELGE_BAS = _XML_BAS
    + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" "
    + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">";

  // python-docx'in bos sablonundan BIREBIR alindi: LETTER sayfa, 1,6 cm
  // ust/alt, 2,0 cm yan. PUNTO_KADEME esikleri tam bu olcuye gore olculdu.
  function _sectPr() {
    return "<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/>"
      + "<w:pgMar w:top=\"" + cm_twip(KENAR_UST) + "\""
      + " w:right=\"" + cm_twip(KENAR_YAN) + "\""
      + " w:bottom=\"" + cm_twip(KENAR_UST) + "\""
      + " w:left=\"" + cm_twip(KENAR_YAN) + "\""
      + " w:header=\"720\" w:footer=\"720\" w:gutter=\"0\"/>"
      + "<w:cols w:space=\"720\"/><w:docGrid w:linePitch=\"360\"/></w:sectPr>";
  }

  // ⚠ docDefaults'taki line="276" lineRule="auto" = 1,15 SATIR ARALIGI.
  // python-docx'in sablonunda bu var ve punto esikleri onunla olculdu.
  // Kaldirilirsa sayfaya daha cok metin sigar, esikler gecersiz olur.
  function _stiller(punto) {
    return _XML_BAS
      + "<w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
      + "<w:docDefaults><w:rPrDefault><w:rPr>"
      + "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/>"
      + "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>"
      + "<w:spacing w:after=\"200\" w:line=\"276\" w:lineRule=\"auto\"/>"
      + "</w:pPr></w:pPrDefault></w:docDefaults>"
      + "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\">"
      + "<w:name w:val=\"Normal\"/><w:qFormat/><w:rPr>"
      + "<w:rFonts w:ascii=\"Times New Roman\" w:hAnsi=\"Times New Roman\"/>"
      + "<w:sz w:val=\"" + pt_yarim(punto) + "\"/>"
      + "</w:rPr></w:style>"
      // "Table Grid": python-docx bunu hazir sablondan aliyor, burada elle
      // taniniyor. Kenarliklari olmazsa ek tablo CIZGISIZ cikar.
      + "<w:style w:type=\"table\" w:default=\"1\" w:styleId=\"TableNormal\">"
      + "<w:name w:val=\"Normal Table\"/><w:tblPr>"
      + "<w:tblInd w:w=\"0\" w:type=\"dxa\"/><w:tblCellMar>"
      + "<w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/>"
      + "<w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/>"
      + "</w:tblCellMar></w:tblPr></w:style>"
      + "<w:style w:type=\"table\" w:styleId=\"TableGrid\">"
      + "<w:name w:val=\"Table Grid\"/><w:basedOn w:val=\"TableNormal\"/>"
      + "<w:uiPriority w:val=\"59\"/>"
      + "<w:pPr><w:spacing w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/></w:pPr>"
      + "<w:tblPr><w:tblInd w:w=\"0\" w:type=\"dxa\"/><w:tblBorders>"
      + "<w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "<w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "<w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "<w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "<w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "<w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"auto\"/>"
      + "</w:tblBorders><w:tblCellMar>"
      + "<w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/>"
      + "<w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/>"
      + "</w:tblCellMar></w:tblPr></w:style>"
      + "</w:styles>";
  }

  const _ICERIK_TURLERI = _XML_BAS
    + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
    + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
    + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
    + "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>"
    + "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>"
    + "</Types>";

  const _KOK_RELS = _XML_BAS
    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    + "<Relationship Id=\"rId1\" "
    + "Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" "
    + "Target=\"word/document.xml\"/></Relationships>";

  const _BELGE_RELS = _XML_BAS
    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
    + "<Relationship Id=\"rId1\" "
    + "Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" "
    + "Target=\"styles.xml\"/></Relationships>";

  // ------------------------------------------------------------------------
  // Ziplenmis .docx -- Promise doner
  // ------------------------------------------------------------------------

  // tur: "uint8array" (Node/test) | "blob" (tarayicida indirme)
  function word_uret(s, bilgi, ek, tur) {
    const Z = _jszip();
    const p = word_parcalari(s, bilgi, ek);
    const zip = new Z();
    // [Content_Types].xml paketin ILK parcasi olmali -- bazi okuyucular
    // sirayi onemsiyor. JSZip ekleme sirasini koruyor.
    for (const yol of Object.keys(p.parcalar)) zip.file(yol, p.parcalar[yol]);
    return zip.generateAsync({
      type: tur || "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    }).then((veri) => ({ veri: veri, punto: p.punto, sigar: p.sigar }));
  }

  const disa = {
    GOVDE_PT: GOVDE_PT, PARA_BOSLUK: PARA_BOSLUK, TABLO_PT: TABLO_PT,
    KENAR_UST: KENAR_UST, KENAR_YAN: KENAR_YAN,
    PUNTO_KADEME: PUNTO_KADEME, KAYNAK_ADI: KAYNAK_ADI, GENISLIK_CM: GENISLIK_CM,
    punto_sec: punto_sec, word_parcalari: word_parcalari, word_uret: word_uret,
    cm_twip: cm_twip, pt_twip: pt_twip, pt_yarim: pt_yarim,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.DisaAktar = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
