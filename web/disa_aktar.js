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


  // ========================================================================
  // EXCEL (.xlsx) -- disa_aktar.py'deki excel_yaz()'in portu
  // ========================================================================
  //
  // NEDEN SHEETJS DEGIL, ELLE XML: SheetJS'in UCRETSIZ surumu .xlsx yazarken
  // STIL YAZAMIYOR. 11.09.2026'da olculdu (yazip openpyxl'e okutarak):
  //
  //     deger, sayi bicimi (z), birlestirme, sutun genisligi  -> GECIYOR
  //     kalin, dolgu rengi, cerceve, hiza, dondurma           -> GECMIYOR
  //
  // Buradaki renkler BILGI TASIYOR: mavi = o ayin neti SGK kazancindan
  // hesaplandi, turuncu = kazanc asgarinin disinda. Memur tabloya bakip
  // hangi satirin teyitli hangisinin tahmin oldugunu bu renklerden anliyor.
  // Yani renk kaybi bicim kaybi degil, BILGI kaybi olurdu.
  //
  // Cozum Word'dekinin aynisi: JSZip + duz OOXML. SheetJS'e dokunulmuyor --
  // dokum OKUMA onunla yapiliyor ve 1.227 kiyasla kanitli, kutuphaneyi
  // degistirmek o kaniti gecersiz kilardi.
  //
  // ⚠ ICERIK openpyxl'in urettiginin BIREBIR AYNISI olmali:
  //   - renkler "00" onekli yaziliyor (openpyxl 6 haneli rgb'yi boyle
  //     normallestiriyor: "DDDDDD" -> "00DDDDDD"),
  //   - "#,##0.00" yerlesik bicim numarasi 4 ile veriliyor,
  //   - metinler sharedStrings degil inlineStr olarak yaziliyor.
  // Uygunlugu web/kiyas_excel.py olcuyor: iki dosyayi da openpyxl ile acip
  // hucre hucre kiyasliyor.

  // Sutun numarasi -> harf (1 -> A). openpyxl'in get_column_letter'i.
  function _sutun_harf(n) {
    let s = "";
    while (n > 0) {
      const kalan = (n - 1) % 26;
      s = String.fromCharCode(65 + kalan) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  // cellXfs sirasi -- openpyxl'in urettigi dosyadaki sirayla ayni anlamda.
  const X_DUZ = 0;        // hicbir sey
  const X_BASLIK13 = 1;   // kalin 13 punto (A1)
  const X_KALIN = 2;      // kalin (etiketler)
  const X_SUTUN = 3;      // kalin + gri dolgu + cerceve + ortali (baslik satiri)
  const X_GOVDE = 4;      // cerceve
  const X_GOVDE_N = 5;    // cerceve + sayi bicimi
  const X_MAVI = 6;       // cerceve + mavi dolgu
  const X_MAVI_N = 7;     // cerceve + mavi dolgu + sayi bicimi
  const X_TOPLAM = 8;     // cerceve + kalin 12 + sayi bicimi
  const X_ARA = 9;        // cerceve + kalin 11 + sayi bicimi
  const X_SARMA = 10;     // sarmali, uste yasli (tutanak)
  const X_TURUNCU = 11;   // cerceve + turuncu dolgu
  const X_TURUNCU_N = 12; // cerceve + turuncu dolgu + sayi bicimi

  const _STILLER =
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="0"/>'
    + '<fonts count="5">'
    + '<font><name val="Calibri"/><family val="2"/><color theme="1"/><sz val="11"/><scheme val="minor"/></font>'
    + '<font><b val="1"/><sz val="13"/></font>'
    + '<font><b val="1"/></font>'
    + '<font><b val="1"/><sz val="12"/></font>'
    + '<font><b val="1"/><sz val="11"/></font>'
    + '</fonts>'
    + '<fills count="5">'
    + '<fill><patternFill/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="00DDDDDD"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="00E4EEFB"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="00FFE9D6"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="2">'
    + '<border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left style="thin"><color rgb="00999999"/></left>'
    + '<right style="thin"><color rgb="00999999"/></right>'
    + '<top style="thin"><color rgb="00999999"/></top>'
    + '<bottom style="thin"><color rgb="00999999"/></bottom></border>'
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="13">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyAlignment="1" xfId="0">'
    + '<alignment horizontal="center"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>'
    + '<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0"/>'
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"/>'
    + '<xf numFmtId="4" fontId="0" fillId="3" borderId="1" xfId="0"/>'
    + '<xf numFmtId="4" fontId="3" fillId="0" borderId="1" xfId="0"/>'
    + '<xf numFmtId="4" fontId="4" fillId="0" borderId="1" xfId="0"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1" xfId="0">'
    + '<alignment vertical="top" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0"/>'
    + '<xf numFmtId="4" fontId="0" fillId="4" borderId="1" xfId="0"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0" hidden="0"/></cellStyles>'
    + '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>'
    + '</styleSheet>';

  // Sutun genislikleri -- disa_aktar.py ile AYNI.
  const EXCEL_GENISLIK = [18, 8, 17, 14, 14, 14, 34];

  // Basit sayfa modeli: hucreler (satir, sutun) -> {v, metin_mi, stil}
  function _Sayfa() {
    this.hucreler = new Map();   // "r:c" -> hucre
    this.birlesmeler = [];
    this.enBuyukSatir = 0;
    this.enBuyukSutun = 0;
  }

  // ⚠ BOS DEGER DE HUCRE URETIR. openpyxl'de ws.cell(r, c, "") cagrisi
  // dosyaya <c r="B5" t="inlineStr"></c> yaziyor -- icinde <is> bile yok
  // ama hucre VAR. Ilk yazimda bos degerler atlanmisti ve iki dosya
  // ayrisiyordu (form bos birakilinca "Isveren" ve "Dosya no" satirlari).
  // Kural basit: yaz() cagrildiysa hucre olusur; hic cagrilmayan hucre yok.
  _Sayfa.prototype.yaz = function (satir, sutun, deger, stil) {
    if (deger === null || deger === undefined) return;
    const metin_mi = (typeof deger !== "number");
    this.hucreler.set(satir + ":" + sutun, {
      v: deger, metin_mi: metin_mi, stil: stil || 0,
    });
    if (satir > this.enBuyukSatir) this.enBuyukSatir = satir;
    if (sutun > this.enBuyukSutun) this.enBuyukSutun = sutun;
  };

  // ⚠ openpyxl sayilari "%.16g" ile yaziyor -- 16 ANLAMLI HANE, sonundaki
  // sifirlar kirpilmis. Python'un repr()'i ve JS'in String()'i ise "en kisa
  // gidip-gelen" gosterimi verir, o da 17 hane olabiliyor. Ikisi ayni sayi
  // ama METIN farkli:
  //     repr(26005.499999999996) -> "26005.499999999996"
  //     "%.16g" % ayni sayi      -> "26005.5"
  // Ilk yazimda String() kullanilmisti ve kiyas 10 farkla yakaladi. Hesap
  // dogruydu, DOSYAYA YAZILAN metin farkliydi.
  //
  // Asagisi "%.<P>g"in birebir taklidi: P anlamli haneye yuvarla; us
  // -4'ten kucukse ya da P'den buyuk/esitse ussel yazim (Python'un
  // "1e-07" / "1.5e+20" bicimi: isaretli, en az iki haneli us).
  const _SAYI_HANE = 16;

  function _sifir_kirp(m) {
    if (m.indexOf(".") === -1) return m;
    m = m.replace(/0+$/, "");
    if (m.charAt(m.length - 1) === ".") m = m.slice(0, -1);
    return m;
  }

  function _sayi_metni(x) {
    if (!isFinite(x)) return String(x);
    if (x === 0) return (1 / x === -Infinity) ? "-0" : "0";
    const P = _SAYI_HANE;
    const us = x.toExponential(P - 1);           // "2.600549999999999e+4"
    const eYeri = us.indexOf("e");
    const e = parseInt(us.slice(eYeri + 1), 10);
    if (e < -4 || e >= P) {
      const mant = _sifir_kirp(us.slice(0, eYeri));
      const mutlak = Math.abs(e);
      return mant + "e" + (e < 0 ? "-" : "+")
        + (mutlak < 10 ? "0" + mutlak : String(mutlak));
    }
    return _sifir_kirp(x.toFixed(P - 1 - e));
  }

  function _sayfa_xml(sf, dondur_satir) {
    const satirNolar = [];
    const gruplar = new Map();
    for (const [anahtar, h] of sf.hucreler) {
      const p = anahtar.split(":");
      const r = parseInt(p[0], 10), c = parseInt(p[1], 10);
      if (!gruplar.has(r)) { gruplar.set(r, []); satirNolar.push(r); }
      gruplar.get(r).push([c, h]);
    }
    satirNolar.sort((a, b) => a - b);

    let sd = "";
    for (const r of satirNolar) {
      const hucreler = gruplar.get(r).sort((a, b) => a[0] - b[0]);
      sd += '<row r="' + r + '">';
      for (const [c, h] of hucreler) {
        const ref = _sutun_harf(c) + r;
        const st = h.stil ? ' s="' + h.stil + '"' : "";
        if (h.metin_mi) {
          const metin = String(h.v);
          if (metin === "") {
            // openpyxl'in bos metin hucresi: <is> YOK.
            sd += '<c r="' + ref + '"' + st + ' t="inlineStr"></c>';
          } else {
            const koru = (metin !== metin.replace(/^\s+|\s+$/g, ""));
            sd += '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t'
              + (koru ? ' xml:space="preserve"' : "") + '>'
              + _kacis(metin) + '</t></is></c>';
          }
        } else {
          sd += '<c r="' + ref + '"' + st + ' t="n"><v>'
            + _sayi_metni(h.v) + '</v></c>';
        }
      }
      sd += "</row>";
    }

    let cols = "<cols>";
    for (let i = 0; i < EXCEL_GENISLIK.length; i++) {
      cols += '<col width="' + EXCEL_GENISLIK[i] + '" customWidth="1" min="'
        + (i + 1) + '" max="' + (i + 1) + '"/>';
    }
    cols += "</cols>";

    // Dondurma: openpyxl freeze_panes = A<dondur_satir> ile ayni XML.
    const pane = '<pane ySplit="' + (dondur_satir - 1) + '" topLeftCell="A'
      + dondur_satir + '" activePane="bottomLeft" state="frozen"/>'
      + '<selection pane="bottomLeft" activeCell="A1" sqref="A1"/>';

    let birlesme = "";
    if (sf.birlesmeler.length) {
      birlesme = '<mergeCells count="' + sf.birlesmeler.length + '">'
        + sf.birlesmeler.map((b) => '<mergeCell ref="' + b + '"/>').join("")
        + "</mergeCells>";
    }

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/><pageSetUpPr/></sheetPr>'
      + '<dimension ref="A1:' + _sutun_harf(sf.enBuyukSutun || 1)
      + (sf.enBuyukSatir || 1) + '"/>'
      + '<sheetViews><sheetView workbookViewId="0">' + pane + '</sheetView></sheetViews>'
      + '<sheetFormatPr baseColWidth="8" defaultRowHeight="15"/>'
      + cols + "<sheetData>" + sd + "</sheetData>" + birlesme
      + '<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/>'
      + "</worksheet>";
  }

  // excel_yaz()'in birebir karsiligi: ayni satirlar, ayni stiller.
  function excel_parcalari(s, bilgi) {
    bilgi = bilgi || {};
    const al = (a) => (bilgi[a] === undefined || bilgi[a] === null) ? "" : bilgi[a];
    const sf = new _Sayfa();

    sf.yaz(1, 1, "MAAŞ HACZİ - İŞVEREN SORUMLULUK HESABI", X_BASLIK13);
    sf.birlesmeler.push("A1:E1");

    let satir = 3;
    const ustBilgi = [
      ["Borçlu", _H.ad_bicimle(al("borclu") || s.kisi)],
      ["İşyeri sicil no", s.isyeri],
      ["İşveren", al("isveren_adi")],
      ["Dosya no", al("dosya_no")],
      ["Müzekkere tebliğ tarihi", tarih_str(s.teblig)],
      ["Karar tarihi", tarih_str(s.karar)],
      ["Çalışma bitişi", s.calisma_bitisi],
    ];
    for (const [etiket, deger] of ustBilgi) {
      sf.yaz(satir, 1, etiket, X_KALIN);
      sf.yaz(satir, 2, deger, X_DUZ);
      satir += 1;
    }

    satir += 1;
    const bas = satir;
    const basliklar = ["Ay", "Gün", "SGK kazancı (aylık brüt)",
      "Esas alınan net maaş", "1/4 (aylık)", "Tutar (TL)",
      "Net esası / açıklama"];
    for (let i = 0; i < basliklar.length; i++) {
      sf.yaz(satir, i + 1, basliklar[i], X_SUTUN);
    }
    satir += 1;

    for (const k of s.kalemler) {
      const esas = (KAYNAK_ADI[k.net_kaynak] || "")
        + (k.aciklama ? " · " + k.aciklama : "");
      // Mavi = net o ayin SGK kazancindan hesaplandi; turuncu = asgari
      // ustu/alti ama hesap yine asgariden yapildi (memur baksin).
      let metinStil = X_GOVDE, sayiStil = X_GOVDE_N;
      if (k.net_kaynak === "pek") {
        metinStil = X_MAVI; sayiStil = X_MAVI_N;
      } else if (k.teyit === "asgari-ustu" || k.teyit === "asgari-alti") {
        metinStil = X_TURUNCU; sayiStil = X_TURUNCU_N;
      }
      const degerler = [k.ay_adi + " " + k.yil, k.gun, k.pek_30, k.net,
        k.ceyrek, k.tutar, esas];
      for (let i = 0; i < degerler.length; i++) {
        const sutun = i + 1;
        const sayi_sutunu = (sutun >= 3 && sutun <= 6);
        sf.yaz(satir, sutun, degerler[i], sayi_sutunu ? sayiStil : metinStil);
      }
      satir += 1;
    }

    satir += 1;
    const ozet = [["TOPLAM", s.toplam, true]];
    if (_H.borc_girildi(s)) ozet.push(["Dosya borcu", s.dosya_borcu, false]);
    ozet.push(["BORÇLANDIRMA", s.borclandirma, true]);
    for (const [etiket, deger, vurgu] of ozet) {
      sf.yaz(satir, 5, etiket, X_KALIN);
      sf.yaz(satir, 6, deger, vurgu ? X_TOPLAM : X_ARA);
      satir += 1;
    }

    satir += 2;
    sf.yaz(satir, 1, "TUTANAK METNİ", X_KALIN);
    satir += 1;
    sf.yaz(satir, 1, _H.tutanak_metni(s), X_SARMA);
    sf.birlesmeler.push("A" + satir + ":G" + (satir + 8));

    if (s.uyarilar.length) {
      satir += 10;
      sf.yaz(satir, 1, "UYARILAR", X_KALIN);
      for (const u of s.uyarilar) {
        satir += 1;
        sf.yaz(satir, 1, u, X_DUZ);
      }
    }

    const parcalar = {};
    parcalar["[Content_Types].xml"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';
    parcalar["_rels/.rels"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';
    parcalar["xl/workbook.xml"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>'
      + '<sheets><sheet name="Hesap" sheetId="1" state="visible" r:id="rId1"/></sheets>'
      + '<calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>';
    parcalar["xl/_rels/workbook.xml.rels"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';
    parcalar["xl/styles.xml"] =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + _STILLER;
    parcalar["xl/worksheets/sheet1.xml"] = _sayfa_xml(sf, bas + 1);

    return { parcalar: parcalar, bas: bas };
  }

  // tur: "uint8array" (Node/test) | "blob" (tarayicida indirme)
  function excel_uret(s, bilgi, tur) {
    const Z = _jszip();
    const p = excel_parcalari(s, bilgi);
    const zip = new Z();
    for (const yol of Object.keys(p.parcalar)) zip.file(yol, p.parcalar[yol]);
    return zip.generateAsync({
      type: tur || "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression: "DEFLATE",
    }).then((veri) => ({ veri: veri }));
  }

  const disa = {
    GOVDE_PT: GOVDE_PT, PARA_BOSLUK: PARA_BOSLUK, TABLO_PT: TABLO_PT,
    KENAR_UST: KENAR_UST, KENAR_YAN: KENAR_YAN,
    PUNTO_KADEME: PUNTO_KADEME, KAYNAK_ADI: KAYNAK_ADI, GENISLIK_CM: GENISLIK_CM,
    punto_sec: punto_sec, word_parcalari: word_parcalari, word_uret: word_uret,
    excel_parcalari: excel_parcalari, excel_uret: excel_uret,
    _sayi_metni: _sayi_metni,
    EXCEL_GENISLIK: EXCEL_GENISLIK, _sutun_harf: _sutun_harf,
    cm_twip: cm_twip, pt_twip: pt_twip, pt_yarim: pt_yarim,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = disa;
  else kok.DisaAktar = disa;
})(typeof globalThis !== "undefined" ? globalThis : this);
