# -*- coding: utf-8 -*-
"""Sonucu Word (.docx) ve Excel (.xlsx) olarak yazar."""

from hesap import (tl, tarih_str, tutanak_metni, ek_ilgi, ek_yonelme,
                   buyuk_harf, ad_bicimle, daire_bicimle, borc_girildi)

# Kalem.net_kaynak -> ciktilarda gorunecek aciklama. Memur, hangi ayin neyden
# hesaplandigini belgeye bakarak anlayabilmeli.
# Tek sayfaya sigdirmak icin ayarlanan olculer. Degistirirsen Word'e
# saydirarak OLC -- goz karariyla "sigar herhalde" deme (olculdu: 12 punto
# + 6pt bosluk ile tutanak 2. sayfaya tasiyordu).
GOVDE_PT = 10.5          # en buyuk punto; icerik uzarsa asagi inilir
PARA_BOSLUK = 4          # paragraf arasi bosluk (punto)
TABLO_PT = 8             # ek sayfadaki hesap tablosu
KENAR_UST = 1.6          # cm
KENAR_YAN = 2.0          # cm

# Tutanak TEK SAYFA olmali. Icerik uzadikca punto kademe kademe kuculuyor.
# ESIKLER TAHMIN DEGIL -- her biri Word'un kendisine saydirildi (yontem ve
# rakamlar CLAUDE.md'de, "tek sayfa" bolumu):
#     2909 karakter  -> 10,5 punto ile tek sayfa
#     3169 karakter  -> 10   punto (10,5'te 2. sayfaya tasiyor)
#     3653 karakter  ->  9,5 punto (10'da tasiyor)
#     4060 karakter  ->  9   punto (9,5'te tasiyor)
#     5125 karakter  ->  8,5'ta BILE sigmiyor  (o zaman uyarilir, susulmaz)
PUNTO_KADEME = ((2900, 10.5), (3150, 10.0), (3650, 9.5), (4100, 9.0))


def punto_sec(karakter):
    """(punto, tek_sayfaya_sigar_mi) dondurur."""
    for sinir, pt in PUNTO_KADEME:
        if karakter <= sinir:
            return min(pt, GOVDE_PT), True
    return min(9.0, GOVDE_PT), False

KAYNAK_ADI = {
    "asgari": "SGK'da tam asgari ücret",
    "pek": "SGK kazancından hesaplanan net",
    "veri-yok": "!!! kazanç bilgisi yok, asgari ücret varsayıldı",
}


# --------------------------------------------------------------------------
# Word
# --------------------------------------------------------------------------

def word_yaz(yol, s, bilgi, ek=False):
    """Tutanagi yazar.

    ek=False (varsayilan): belge TEK SAYFA. Ertugrul 02.09.2026'da soyledi --
    "wordu tek sayfada yapsin, tasiriyor". Olculdu: eski hali 4 sayfaydi,
    bunun 1 sayfasi tutanak, 3 sayfasi ek tabloydu. Tablo 6 sutuna
    sikistirildigi icin her satiri 8 satira yayiliyordu (Word'e sayduruldu:
    13 satirlik tablo 114 SATIR yer kapliyordu).

    ek=True: hesap dokumu tablosu ayri sayfada eklenir. Arayuzdeki
    "Hesap dokumu ekini de yaz" kutusu bunu aciyor.
    """
    from docx import Document
    from docx.shared import Pt, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    d = Document()
    st = d.styles["Normal"]
    st.font.name = "Times New Roman"
    for bolum in d.sections:
        bolum.top_margin = bolum.bottom_margin = Cm(KENAR_UST)
        bolum.left_margin = bolum.right_margin = Cm(KENAR_YAN)

    # ---- IKI ASAMA. Punto icerik uzunluguna gore secilecegi icin metnin
    # TAMAMI once toplanir, sonra tek seferde yazilir. Yazarken secmek
    # mumkun degil: ilk paragrafi yazarken sonuncunun ne kadar uzun
    # olacagini bilmiyoruz.
    islemler = []          # (parcalar, hiza, ilk_satir, bosluk)

    def par(metin="", kalin=False, hiza=WD_ALIGN_PARAGRAPH.JUSTIFY,
            ilk_satir=None, bosluk=None):
        islemler.append(([(metin, kalin)], hiza, ilk_satir, bosluk))

    def par_cok(parcalar, hiza=WD_ALIGN_PARAGRAPH.JUSTIFY, ilk_satir=None,
                bosluk=None):
        """Ayni paragrafta kalin + duz parca ("Karar : ..." gibi)."""
        islemler.append((parcalar, hiza, ilk_satir, bosluk))

    def yaz(parcalar, hiza, ilk_satir, bosluk):
        p = d.add_paragraph()
        p.alignment = hiza
        p.paragraph_format.space_after = Pt(PARA_BOSLUK if bosluk is None else bosluk)
        p.paragraph_format.space_before = Pt(0)
        if ilk_satir:
            p.paragraph_format.first_line_indent = Cm(ilk_satir)
        for metin, kalin in parcalar:
            p.add_run(metin).bold = kalin
        return p

    # Baslik. Kullanici kucuk harfle yazsa da belgeye BUYUK gider; icra
    # dairesine sadece "3" yazmasi yeter, "3. ICRA DAIRESI" olur.
    for satir in ("T.C.", buyuk_harf(bilgi.get("il", "")),
                  daire_bicimle(bilgi.get("daire", "")),
                  bilgi.get("dosya_no", "")):
        if satir:
            par(satir, kalin=True, hiza=WD_ALIGN_PARAGRAPH.LEFT)

    par(bosluk=2)
    par("KARAR TENSİP TUTANAĞI", kalin=True, hiza=WD_ALIGN_PARAGRAPH.CENTER)

    borclu = ad_bicimle(bilgi.get("borclu") or s.kisi) or "borçlu"
    isveren = bilgi.get("isveren_adi") or f"{s.isyeri} sicil numaralı işyeri"
    ay_sayisi = len(s.kalemler)

    # Kusur cumlesi tutanak govdesiyle AYNI olmali; ikisi ayri yerde uretiliyor,
    # birini degistirip otekini unutmak "sayi dogru, metin yanlis" demek.
    kusur_cumle = ("Ancak müzekkere gereğince maaştan kesinti yapılmamıştır."
                   if s.kusur == "kesinti-yok"
                   else "Ancak herhangi bir cevap verilmemiştir.")
    par(f"Talep : Yukarıda dosya numarası yazılı bulunan dosyada dosyamız borçlusu "
        f"{ek_ilgi(borclu)} almakta olduğu maaşına haciz müzekkeresi yazılmış ve "
        f"{ek_yonelme(isveren)} {tarih_str(s.teblig)} tarihinde tebliğ olmuştur. "
        f"{kusur_cumle} Buna göre {ay_sayisi} aylık işveren borçludur.",
        ilk_satir=1.25)

    par("Genel olarak İ.İ.K. 355 VE 356 md. İ.İ.K. 356. md. 'Yukarıdaki madde "
        "hükümlerine riayet etmemiş olanların kesmedikleri veya ilk vasıta ile "
        "göndermedikleri para ayrıca mahkemeden hüküm alınmaksızın hacet kalmaksızın "
        "icra dairesince maaşlarından ve sair mallarından alınır.' hükmü gereği maaş "
        "tekit müzekkeresi tebliğ etme zorunluluğu olmayıp nitekim normal maaş haczi "
        "tebliğ müzekkeresinde işverenin sorumluluğunda olan kesintilerin yapılmaması "
        "halinde sorumlulukları tebliğ edilmiştir.", ilk_satir=1.25)

    par(f"İşveren {ek_ilgi(isveren)} dosyaya borçlu sıfatıyla eklenmesini,", ilk_satir=1.25)
    par("- Sorgulama yapılabilmesi için kesinleştirme yapılmasını,",
        hiza=WD_ALIGN_PARAGRAPH.LEFT)
    par(f"- Adına kayıtlı araç ve Taşınmazlara haciz şerhi konulmasını talep ederim. "
        f"{tarih_str(s.karar)}", hiza=WD_ALIGN_PARAGRAPH.LEFT)
    par()

    par_cok([("Karar : ", True),
             ("Müdürlüğümüz takip dosyasına alacaklının gönderdiği talep dilekçesi "
              "ve takip dosyası incelenmekle;", False)], ilk_satir=1.25)

    # Kagitta bu paragraf 3. sahsin (isverenin) adiyla basliyor: isveren cevap
    # vermeyen taraf, "borclunun maasi" ise haczedilen maas.
    govde = tutanak_metni(s)
    par(f"{ek_ilgi(isveren)} {govde[0].lower() + govde[1:]}", ilk_satir=1.25)

    par("3. Şahsın borçlu olarak eklenmesi yönündeki talebin kabulüne", ilk_satir=1.25)
    par("* 3. Şahıs Borçlu ile ilgili gerekli sorgulamaların yapılmasına, sorguların "
        "UYAP üzerinden dosyaya kaydedilmesine, adına kayıtlı olduğunun tespit "
        "edilmesi ve dosyamızda masraf bulunmaması halinde yatırıldığında ve bu ilgili "
        "yerlere istenilen müzekkerelerin yazılmasına, masraf bulunmaması halinde bu "
        "durumun müdürlüğümüze talep ile bildirilmesi halinde bu yönde yeniden karar "
        "alınmasına karar verildi.", ilk_satir=1.25)
    par(tarih_str(s.karar), hiza=WD_ALIGN_PARAGRAPH.LEFT)
    par()

    if bilgi.get("personel"):
        par(f"İşlemi Yapacak Personel : {ad_bicimle(bilgi['personel'])}",
            kalin=True, hiza=WD_ALIGN_PARAGRAPH.LEFT)
    par()
    for satir in (ad_bicimle(bilgi.get("imza_ad", "")), bilgi.get("imza_unvan", ""),
                  bilgi.get("imza_sicil", "")):
        if satir:
            par(satir, hiza=WD_ALIGN_PARAGRAPH.RIGHT)

    # ---- Asama 2: olc, punto sec, yaz
    karakter = sum(len(m) for parcalar, _, _, _ in islemler for m, _ in parcalar)
    punto, sigar = punto_sec(karakter)
    st.font.size = Pt(punto)
    for parcalar, hiza, ilk_satir, bosluk in islemler:
        yaz(parcalar, hiza, ilk_satir, bosluk)

    if not ek:
        d.save(yol)
        return yol, punto, sigar

    # Ek sayfa: hesap dokumu. Sutun genislikleri ELLE veriliyor -- Word'un
    # otomatigi 6 sutunu esit bolusturuyor ve aciklama sutunu 8 satira
    # yayilip tabloyu 3 sayfaya cikariyordu (olculdu).
    # d.add_page_break() KULLANMA: ayri bir bos paragraf uretiyor, govde
    # sayfanin dibinde bitince o paragraf 2. sayfaya dusuyor ve kirilma
    # tabloyu 3. sayfaya atiyor -- arada BOMBOS bir sayfa kaliyor (olculdu,
    # PDF'e cevirilip gozle goruldu). Kirilma basligin kendi ustune konuyor.
    p_ek = yaz([("HESAP DÖKÜMÜ (ek)", True)], WD_ALIGN_PARAGRAPH.CENTER,
               None, None)
    p_ek.paragraph_format.page_break_before = True

    # Sutun basligi "Asgari ucret 1/4" DEGIL: net, o ayin SGK kazancindan da
    # gelmis olabilir. Hangi aya hangi maasin esas alindigi "Net esası"
    # sutununda yaziyor -- sayi dogruyken metin yanlis kalmasin.
    t = d.add_table(rows=1, cols=6)
    t.style = "Table Grid"
    t.autofit = False
    # Ilk sutun 2,6 cm iken "BORCLANDIRMA" ikiye bolunuyordu (PDF'e
    # cevirilip gozle goruldu). 3,1 cm yapildi, fark son sutundan alindi.
    genislik = (Cm(3.1), Cm(1.2), Cm(2.8), Cm(2.2), Cm(2.4), Cm(5.3))
    # DIKKAT: sabit duzende Word <w:gridCol> genisligini esas aliyor; sadece
    # hucre (tcW) genisligini yazmak YETMIYOR -- olculdu, tablo yine 6 esit
    # sutuna bolunup 3 sayfaya yayiliyordu. columns[i].width gridCol'u yazar.
    for sutun, g in zip(t.columns, genislik):
        sutun.width = g

    def hucreye(hucre, metin, kalin=False):
        p = hucre.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.space_before = Pt(0)
        r = p.add_run(metin)
        r.bold = kalin
        r.font.size = Pt(TABLO_PT)

    for h, hucre, g in zip(("Ay", "Gün", "Esas alınan net maaş", "1/4",
                            "Tutar (TL)", "Net esası / açıklama"),
                           t.rows[0].cells, genislik):
        hucre.width = g
        hucreye(hucre, h, kalin=True)
    for k in s.kalemler:
        c = t.add_row().cells
        degerler = (f"{k.ay_adi} {k.yil}", str(k.gun), tl(k.net), tl(k.ceyrek),
                    tl(k.tutar),
                    KAYNAK_ADI.get(k.net_kaynak, "") +
                    (" · " + k.aciklama if k.aciklama else ""))
        for hucre, deger, g in zip(c, degerler, genislik):
            hucre.width = g
            hucreye(hucre, deger)
    # Dosya borcu girilmediyse tabloya "0,00" YAZILMAZ -- belgede olmayan bir
    # tespit gibi durur. Sadece TOPLAM ve BORCLANDIRMA gosterilir.
    ozet = [("TOPLAM", s.toplam)]
    if borc_girildi(s):
        ozet.append(("Dosya borcu", s.dosya_borcu))
    ozet.append(("BORÇLANDIRMA", s.borclandirma))
    for etiket, deger in ozet:
        c = t.add_row().cells
        for hucre, g in zip(c, genislik):
            hucre.width = g
        hucreye(c[0], etiket, kalin=True)
        hucreye(c[4], tl(deger), kalin=True)

    d.save(yol)
    return yol, punto, sigar


# --------------------------------------------------------------------------
# Excel
# --------------------------------------------------------------------------

def excel_yaz(yol, s, bilgi):
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

    wb = Workbook()
    ws = wb.active
    ws.title = "Hesap"

    kalin = Font(bold=True)
    baslik_dolgu = PatternFill("solid", fgColor="DDDDDD")
    ince = Side(style="thin", color="999999")
    cerceve = Border(left=ince, right=ince, top=ince, bottom=ince)

    ws["A1"] = "MAAŞ HACZİ - İŞVEREN SORUMLULUK HESABI"
    ws["A1"].font = Font(bold=True, size=13)
    ws.merge_cells("A1:E1")

    satir = 3
    for etiket, deger in (
        ("Borçlu", ad_bicimle(bilgi.get("borclu") or s.kisi)),
        ("İşyeri sicil no", s.isyeri),
        ("İşveren", bilgi.get("isveren_adi", "")),
        ("Dosya no", bilgi.get("dosya_no", "")),
        ("Müzekkere tebliğ tarihi", tarih_str(s.teblig)),
        ("Karar tarihi", tarih_str(s.karar)),
        ("Çalışma bitişi", s.calisma_bitisi),
    ):
        ws.cell(satir, 1, etiket).font = kalin
        ws.cell(satir, 2, deger)
        satir += 1

    satir += 1
    bas = satir
    for i, h in enumerate(("Ay", "Gün", "SGK kazancı (aylık brüt)",
                           "Esas alınan net maaş", "1/4 (aylık)", "Tutar (TL)",
                           "Net esası / açıklama"), 1):
        c = ws.cell(satir, i, h)
        c.font = kalin
        c.fill = baslik_dolgu
        c.border = cerceve
        c.alignment = Alignment(horizontal="center")
    satir += 1

    for k in s.kalemler:
        esas = (KAYNAK_ADI.get(k.net_kaynak, "") +
                (" · " + k.aciklama if k.aciklama else ""))
        for i, v in enumerate((f"{k.ay_adi} {k.yil}", k.gun, k.pek_30, k.net,
                               k.ceyrek, k.tutar, esas), 1):
            c = ws.cell(satir, i, v)
            c.border = cerceve
            if i in (3, 4, 5, 6):
                c.number_format = "#,##0.00"
            # Mavi = net o ayin SGK kazancindan hesaplandi; turuncu = asgari
            # ustu/alti ama hesap yine asgariden yapildi (memur baksin).
            if k.net_kaynak == "pek":
                c.fill = PatternFill("solid", fgColor="E4EEFB")
            elif k.teyit in ("asgari-ustu", "asgari-alti"):
                c.fill = PatternFill("solid", fgColor="FFE9D6")
        satir += 1

    satir += 1
    ozet = [("TOPLAM", s.toplam, True)]
    if borc_girildi(s):
        ozet.append(("Dosya borcu", s.dosya_borcu, False))
    ozet.append(("BORÇLANDIRMA", s.borclandirma, True))
    for etiket, deger, vurgu in ozet:
        ws.cell(satir, 5, etiket).font = kalin
        c = ws.cell(satir, 6, deger)
        c.number_format = "#,##0.00"
        c.font = Font(bold=True, size=12 if vurgu else 11)
        c.border = cerceve
        satir += 1

    satir += 2
    ws.cell(satir, 1, "TUTANAK METNİ").font = kalin
    satir += 1
    ws.cell(satir, 1, tutanak_metni(s)).alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=satir, start_column=1, end_row=satir + 8, end_column=7)

    if s.uyarilar:
        satir += 10
        ws.cell(satir, 1, "UYARILAR").font = kalin
        for u in s.uyarilar:
            satir += 1
            ws.cell(satir, 1, u)

    for sut, gen in zip("ABCDEFG", (18, 8, 17, 14, 14, 14, 34)):
        ws.column_dimensions[sut].width = gen
    ws.freeze_panes = ws.cell(bas + 1, 1)

    wb.save(yol)
    return yol
