# -*- coding: utf-8 -*-
"""
Maas Haczi - Isveren Sorumluluk Hesabi (IIK 355-356)
Masaustu penceresi. Calistirmak icin:  py -3.13 arayuz.py
"""

import os
import sys
import subprocess
import traceback
from datetime import date

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hesap import (Ayarlar, dokum_oku, isverenleri_listele, hesapla,
                   kol_ozeti, KOL_ADI,
                   tutanak_metni, tarih_coz, tarih_str, para_coz, tl,
                   borc_girildi, ad_bicimle, daire_bicimle, buyuk_harf)
import disa_aktar

from hesap import _uygulama_klasoru

KLASOR = _uygulama_klasoru()

# Tutanak cumlesini secer, hesabi DEGISTIRMEZ. IIK 356 iki kusuru da kapsiyor:
# "kesmedikleri VEYA ilk vasita ile gondermedikleri para".
KUSUR_SECENEK = ("Müzekkereye cevap vermedi", "Cevap verdi, kesinti yapmadı")
KUSUR_KOD = {KUSUR_SECENEK[0]: "cevap-yok", KUSUR_SECENEK[1]: "kesinti-yok"}


class Uygulama(tk.Tk):

    def __init__(self):
        super().__init__()
        self.title("Maaş Haczi — İşveren Sorumluluk Hesabı (İİK 355-356)")
        self.geometry("1060x880")
        self.minsize(900, 640)

        try:                                  # Windows'ta net yazi (DPI farkindaligi)
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
        try:
            ttk.Style().theme_use("vista")
        except tk.TclError:
            pass

        self.kayitlar = []
        self.kisi = ""
        self.okuma_uyarilari = []
        self.isverenler = []
        self.sonuc = None
        self.ayarlar = None

        self._arayuzu_kur()
        self._ayarlari_yukle()
        self._varsayilan_dosya()

    # ---------------------------------------------------------------- kurulum

    def _arayuzu_kur(self):
        dis = ttk.Frame(self, padding=10)
        dis.pack(fill="both", expand=True)

        # ---- Girdiler
        g = ttk.LabelFrame(dis, text=" 1. Bilgileri gir ", padding=10)
        g.pack(fill="x")
        g.columnconfigure(1, weight=1)

        ttk.Label(g, text="SGK hizmet dökümü:").grid(row=0, column=0, sticky="w", pady=3)
        self.v_dosya = tk.StringVar()
        ttk.Entry(g, textvariable=self.v_dosya).grid(row=0, column=1, columnspan=3,
                                                     sticky="ew", padx=6)
        ttk.Button(g, text="Seç...", command=self.dosya_sec, width=10)\
            .grid(row=0, column=4, sticky="w")

        ttk.Label(g, text="Müzekkere tebliğ tarihi:").grid(row=1, column=0, sticky="w", pady=3)
        self.v_teblig = tk.StringVar()
        e1 = ttk.Entry(g, textvariable=self.v_teblig, width=14)
        e1.grid(row=1, column=1, sticky="w", padx=6)
        # Sadece FocusOut'a baglamak yetmiyor: kullanici tarihi yazip dogrudan
        # HESAPLA'ya basarsa liste tazelenmemis olabiliyordu. Her tus vurusunda
        # tazele -- tarih henuz yarimsa tarih_coz zaten patlamiyor, "tamamini
        # listele" moduna dusuyor.
        self.v_teblig.trace_add("write", lambda *a: self.isverenleri_yenile())

        ttk.Label(g, text="Karar (tespit) tarihi:").grid(row=1, column=2, sticky="e", padx=(20, 0))
        self.v_karar = tk.StringVar(value=tarih_str(date.today()))
        e2 = ttk.Entry(g, textvariable=self.v_karar, width=14)
        e2.grid(row=1, column=3, sticky="w", padx=6)
        self.v_karar.trace_add("write", lambda *a: self.isverenleri_yenile())

        ttk.Label(g, text="Dosya borcu (TL):").grid(row=2, column=0, sticky="w", pady=3)
        self.v_borc = tk.StringVar()
        ttk.Entry(g, textvariable=self.v_borc, width=14).grid(row=2, column=1, sticky="w", padx=6)

        # Maas alani YOK ve olmayacak: borclunun her ay ne kazandigi SGK hizmet
        # dokumunun kendisinde yazili, program oradan okuyor. Buradaki secim
        # sadece tutanak cumlesini degistirir, hesabi degil.
        ttk.Label(g, text="İşverenin kusuru:").grid(row=2, column=2, sticky="e",
                                                    padx=(20, 0))
        self.v_kusur = tk.StringVar(value=KUSUR_SECENEK[0])
        ttk.Combobox(g, textvariable=self.v_kusur, state="readonly", width=30,
                     values=KUSUR_SECENEK).grid(row=2, column=3, columnspan=2,
                                                sticky="w", padx=6)

        ttk.Label(g, text="Maaş sorulmuyor — her ayın ücreti SGK hizmet dökümündeki "
                          "kazanç (PEK) sütunundan okunuyor  ·  Dosya borcu boşsa "
                          "üst sınır uygulanmaz",
                  foreground="#666").grid(row=3, column=0, columnspan=5,
                                          sticky="w", pady=(0, 4))

        ttk.Label(g, text="İşveren (işyeri sicil no):").grid(row=5, column=0, sticky="w", pady=3)
        self.v_isveren = tk.StringVar()
        self.cb_isveren = ttk.Combobox(g, textvariable=self.v_isveren, state="readonly")
        self.cb_isveren.grid(row=5, column=1, columnspan=3, sticky="ew", padx=6)
        ttk.Label(g, text="* = tebliğ ayında kaydı var",
                  foreground="#666").grid(row=5, column=4, sticky="w")

        ttk.Button(g, text="HESAPLA", command=self.hesapla)\
            .grid(row=6, column=0, columnspan=5, pady=(10, 0), sticky="ew")

        # ---- Tutanak bilgileri
        t = ttk.LabelFrame(dis, text=" 2. Tutanak bilgileri (Word çıktısı için, isteğe bağlı) ",
                           padding=10)
        t.pack(fill="x", pady=(10, 0))
        for i in (1, 3, 5):
            t.columnconfigure(i, weight=1)

        self.v_bilgi = {}
        alanlar = [
            ("il", "İl"), ("daire", "İcra dairesi"), ("dosya_no", "Dosya no"),
            ("borclu", "Borçlu adı"), ("isveren_adi", "İşveren unvanı"),
            ("personel", "İşlemi yapacak personel"),
            ("imza_ad", "İmza — ad"), ("imza_unvan", "İmza — unvan"),
            ("imza_sicil", "İmza — sicil"),
        ]
        for i, (anahtar, etiket) in enumerate(alanlar):
            r, c = divmod(i, 3)
            ttk.Label(t, text=etiket + ":").grid(row=r, column=c * 2, sticky="w", pady=2)
            if anahtar == "dosya_no":          # tek kutu degil, yil / sira
                self._dosya_no_kutulari(t, r, c * 2 + 1)
                continue
            self.v_bilgi[anahtar] = tk.StringVar()
            ttk.Entry(t, textvariable=self.v_bilgi[anahtar])\
                .grid(row=r, column=c * 2 + 1, sticky="ew", padx=(4, 14), pady=2)

        ttk.Label(t, text="Word’e giderken: İl ve daire BÜYÜK harfe çevrilir  ·  "
                          "İcra dairesine sadece “3” yazman yeter → “3. İCRA DAİRESİ”  ·  "
                          "ad “Ahmet YILMAZ” olur (son kelime = soyad)",
                  foreground="#666").grid(row=3, column=0, columnspan=6,
                                          sticky="w", pady=(6, 0))

        # ---- Sonuc
        self.nb = ttk.Notebook(dis)
        self.nb.pack(fill="both", expand=True, pady=(10, 0))

        s1 = ttk.Frame(self.nb, padding=6)
        self.nb.add(s1, text="  Tablo  ")
        sutunlar = ("ay", "gun", "pek", "net", "ceyrek", "tutar", "aciklama")
        basliklar = ("Ay", "Gün", "SGK kazancı (aylık brüt)", "Esas alınan net maaş",
                     "1/4", "Tutar (TL)", "Açıklama")
        genislik = (105, 45, 125, 135, 110, 110, 270)
        self.tablo = ttk.Treeview(s1, columns=sutunlar, show="headings", height=14)
        for s, b, w in zip(sutunlar, basliklar, genislik):
            self.tablo.heading(s, text=b)
            self.tablo.column(s, width=w,
                              anchor="e" if s in ("gun", "pek", "net", "ceyrek",
                                                  "tutar") else "w")
        self.tablo.tag_configure("toplam", font=("Segoe UI", 9, "bold"))
        self.tablo.tag_configure("sonuc", font=("Segoe UI", 10, "bold"),
                                 background="#e8f0d8")
        self.tablo.tag_configure("dikkat", background="#ffe9d6")
        self.tablo.tag_configure("teyitli", background="#eef6ec")
        # PEK'ten net hesaplanan aylar: asgari ucret satirlarindan gozle ayrilsin.
        self.tablo.tag_configure("pekten", background="#e4eefb")
        kaydir = ttk.Scrollbar(s1, orient="vertical", command=self.tablo.yview)
        self.tablo.configure(yscrollcommand=kaydir.set)
        self.tablo.pack(side="left", fill="both", expand=True)
        kaydir.pack(side="right", fill="y")

        s2 = ttk.Frame(self.nb, padding=6)
        self.nb.add(s2, text="  Tutanak metni  ")
        self.metin = tk.Text(s2, wrap="word", font=("Segoe UI", 10), padx=8, pady=8)
        k2 = ttk.Scrollbar(s2, orient="vertical", command=self.metin.yview)
        self.metin.configure(yscrollcommand=k2.set)
        self.metin.pack(side="left", fill="both", expand=True)
        k2.pack(side="right", fill="y")

        s3 = ttk.Frame(self.nb, padding=6)
        self.nb.add(s3, text="  Uyarılar  ")
        self.uyari_kutu = tk.Text(s3, wrap="word", font=("Consolas", 9), padx=8, pady=8)
        k3 = ttk.Scrollbar(s3, orient="vertical", command=self.uyari_kutu.yview)
        self.uyari_kutu.configure(yscrollcommand=k3.set)
        self.uyari_kutu.pack(side="left", fill="both", expand=True)
        k3.pack(side="right", fill="y")

        # ---- Butonlar
        b = ttk.Frame(dis)
        b.pack(fill="x", pady=(10, 0))
        ttk.Button(b, text="Metni kopyala", command=self.metni_kopyala)\
            .pack(side="left", padx=(0, 6))
        ttk.Button(b, text="Word'e aktar", command=self.worde_aktar)\
            .pack(side="left", padx=6)
        ttk.Button(b, text="Excel'e aktar", command=self.excele_aktar)\
            .pack(side="left", padx=6)

        # Word varsayilan olarak TEK SAYFA. Hesap dokumu tablosunu isteyen
        # bunu isaretler; o zaman tablo AYRI bir sayfaya eklenir.
        self.v_ek = tk.BooleanVar(value=False)
        ttk.Checkbutton(b, text="Word’e hesap dökümü ekini de koy (2. sayfa)",
                        variable=self.v_ek).pack(side="left", padx=(16, 0))

        ttk.Button(b, text="Asgari ücret tablosu", command=self.ayarlari_ac)\
            .pack(side="right")

        self.durum = tk.StringVar(value="Hazır.")
        ttk.Label(dis, textvariable=self.durum, foreground="#444")\
            .pack(fill="x", pady=(8, 0))

    def _dosya_no_kutulari(self, ust, satir, sutun):
        """Dosya no'yu iki kutuya boler:  [2025] / [10000]

        Yil 4 hane oldugu an imlec kendiliginden ikinci kutuya atlar. Yil
        kutusu sadece rakam kabul eder (yil zaten rakam; atlamanin olcusu bu).
        Sira kutusuna dokunulmuyor -- dairenin sira numarasi kac haneli olur
        bilinmiyor, maske koyup kullaniciyi kilitlemeyelim.
        """
        cerceve = ttk.Frame(ust)
        cerceve.grid(row=satir, column=sutun, sticky="w", padx=(4, 14), pady=2)

        self.v_dosya_yil = tk.StringVar()
        self.v_dosya_sira = tk.StringVar()

        e_yil = ttk.Entry(cerceve, textvariable=self.v_dosya_yil, width=6,
                          justify="center")
        e_yil.pack(side="left")
        ttk.Label(cerceve, text=" / ", font=("Segoe UI", 11, "bold")).pack(side="left")
        e_sira = ttk.Entry(cerceve, textvariable=self.v_dosya_sira, width=12)
        e_sira.pack(side="left")
        ttk.Label(cerceve, text="  (yıl / sıra no)",
                  foreground="#666").pack(side="left")

        def yil_yazildi(*a):
            ham = self.v_dosya_yil.get()
            temiz = "".join(ch for ch in ham if ch.isdigit())[:4]
            if temiz != ham:
                self.v_dosya_yil.set(temiz)     # bu satir izleyiciyi tekrar
                return                          # tetikler; ikinci turda esit
            if len(temiz) == 4:
                e_sira.focus_set()

        self.v_dosya_yil.trace_add("write", yil_yazildi)
        self._e_yil, self._e_sira = e_yil, e_sira      # test icin tutuluyor

    def _dosya_no(self):
        """'2025' + '10000' -> '2025/10000'  (biri bossa oteki tek basina)"""
        y = self.v_dosya_yil.get().strip()
        n = self.v_dosya_sira.get().strip()
        if y and n:
            return f"{y}/{n}"
        return y or n

    # ---------------------------------------------------------------- yardimci

    def _ayarlari_yukle(self):
        try:
            self.ayarlar = Ayarlar.yukle()
            son = self.ayarlar.donemler[-1]
            self.durum.set(f"Asgari ücret tablosu yüklendi — en son dönem "
                           f"{son[1]:02d}/{son[0]}, net {tl(son[2])} TL, 1/4 = {tl(son[3])} TL")
        except Exception as e:
            messagebox.showerror("ayarlar.json okunamadı", str(e))
            self.durum.set("ayarlar.json okunamadı!")

    def _varsayilan_dosya(self):
        """Klasordeki SGK dokumunu acilista kendiliginden acar.

        02.09.2026'DA OLCULDU: eskiden alfabetik ilk .xls/.xlsx dosyasi
        secilip DOGRUDAN okunuyordu. Ama klasorde bu programin KENDI urettigi
        "..._hesap.xlsx" dosyalari da duruyor; bir kez Excel'e aktarilinca o
        dosya alfabetik olarak lll.xls'in onune geciyor, program onu SGK
        dokumu saniyor ve acilista "Excel xlsx file; not supported" hata
        penceresi cikip isveren listesi BOS kaliyordu -- yani program tekrar
        kullanilamaz hale geliyordu.

        Artik: kendi ciktilarimiz atlaniyor, kalan adaylar sirayla DENENIYOR,
        okunamayan atlanip digerine geciliyor. Acilis tahmininde hata
        PENCERESI cikmiyor (kullaniciyi durdurmasin) ama sessiz de kalmiyor:
        ne denendigi ve neden olmadigi durum cubuguna yaziliyor.
        """
        adaylar = [a for a in sorted(os.listdir(KLASOR))
                   if a.lower().endswith((".xls", ".xlsx"))
                   and not a.startswith("~$")                 # Office kilidi
                   and "_hesap." not in a.lower()]            # kendi ciktimiz
        adaylar.sort(key=lambda a: 0 if a.lower().endswith(".xls") else 1)

        olmayanlar = []
        for ad in adaylar:
            self.v_dosya.set(os.path.join(KLASOR, ad))
            if self.dosyayi_oku(sessiz=True):
                if olmayanlar:
                    self.durum.set(self.durum.get() +
                                   f"  ({len(olmayanlar)} dosya atlandi: "
                                   f"{', '.join(olmayanlar)})")
                return
            olmayanlar.append(ad)

        self.v_dosya.set("")
        if olmayanlar:
            self.durum.set(f"Klasordeki dosyalar SGK hizmet dokumu degil "
                           f"({', '.join(olmayanlar)}) - 'Sec...' ile dogru "
                           f"dosyayi goster.".replace("Klasordeki", "Klasördeki")
                           .replace("dokumu degil", "dökümü değil"))
        else:
            self.durum.set("Klasörde .xls/.xlsx yok — 'Seç...' ile SGK hizmet "
                           "dökümünü göster.")

    def _hata(self, baslik, e):
        self.durum.set(f"HATA: {e}")
        messagebox.showerror(baslik, str(e))

    # ---------------------------------------------------------------- eylemler

    def dosya_sec(self):
        yol = filedialog.askopenfilename(
            title="SGK hizmet dökümünü seç",
            initialdir=KLASOR,
            filetypes=[("Excel dosyaları", "*.xls *.xlsx"), ("Tüm dosyalar", "*.*")])
        if yol:
            self.v_dosya.set(yol)
            self.dosyayi_oku()

    def dosyayi_oku(self, sessiz=False):
        """Dokumu okur. sessiz=True: acilis tahmini -- hata penceresi acmaz,
        sadece False doner (cagiran durumu kullaniciya bildirir)."""
        yol = self.v_dosya.get().strip()
        if not yol or not os.path.exists(yol):
            if not sessiz:
                self.durum.set("Dosya bulunamadı: " + (yol or "(boş)"))
            return False
        try:
            self.kayitlar, self.kisi, self.okuma_uyarilari = dokum_oku(yol)
        except Exception as e:
            self.kayitlar = []
            if not sessiz:
                self._hata("Dosya okunamadı", e)
            return False
        if self.kisi and not self.v_bilgi["borclu"].get():
            self.v_bilgi["borclu"].set(self.kisi)
        self.durum.set(f"{len(self.kayitlar)} hizmet kaydı okundu"
                       + (f" — {self.kisi}" if self.kisi else "")
                       + f"  ({os.path.basename(yol)})")
        self.isverenleri_yenile()
        return True

    def isverenleri_yenile(self):
        """Isveren listesini tazeler.

        SESSIZ KALMAK YASAK. Eskiden teblig tarihi bos oldugu surece bu
        fonksiyon hicbir sey demeden geri donuyordu; dosya okunuyor, liste bos
        kaliyor, durum cubugu "85 kayit okundu" diyerek her sey yolundaymis
        gibi gorunuyordu. Artik tarih yoksa BUTUN isverenler listeleniyor ve
        durum cubugu ne eksik oldugunu soyluyor.
        """
        if not self.kayitlar:
            self.cb_isveren["values"] = []
            self.v_isveren.set("")
            self.durum.set("Önce SGK hizmet dökümünü seç.")
            return

        eksik = []
        try:
            teblig = tarih_coz(self.v_teblig.get())
        except ValueError:
            teblig = None
            eksik.append("tebliğ tarihi")
        try:
            karar = tarih_coz(self.v_karar.get())
        except ValueError:
            karar = None
            eksik.append("karar tarihi")

        self.isverenler = isverenleri_listele(self.kayitlar, teblig, karar)
        etiketler = [i.etiket() for i in self.isverenler]
        self.cb_isveren["values"] = etiketler

        if not etiketler:
            self.v_isveren.set("")
            # YANLIS FAIL GOSTERME. Eskiden tarihler girilmisse hep "bu tarih
            # araliginda isveren yok" deniyordu; oysa dokumde hic 4a olmayabilir
            # (memur/Bagkur dosyasi). Kullanici tarihle ugrasip duruyordu.
            # 03.09.2026'da gercek bir 4c (memur) dokumuyle olculdu.
            ozet = kol_ozeti(self.kayitlar)
            if not ozet.get("4a"):
                disi = ", ".join(f"{KOL_ADI.get(k, k)}: {n}"
                                 for k, n in sorted(ozet.items()))
                self.durum.set(
                    f"Dökümde hiç 4a (işçi) kaydı YOK — {disi}. Bu program "
                    f"sadece 4a hesaplar; memur/kamu dosyasında maaş bilgisi "
                    f"kurumdan (bordro) istenmeli. Ayrıntı: Uyarılar sekmesi.")
            else:
                self.durum.set("Bu tarih aralığında hiç 4a işveren kaydı yok — "
                               "tebliğ/karar tarihini kontrol et.")
            return

        if self.v_isveren.get() not in etiketler:
            self.cb_isveren.current(0)

        if eksik:
            self.durum.set(
                f"{len(etiketler)} işveren listelendi (dökümün tamamı). "
                f"{' ve '.join(eksik).capitalize()} girilince liste daralacak.")
        elif len(etiketler) > 1:
            self.durum.set(f"DİKKAT: bu aralıkta {len(etiketler)} işveren var — "
                           f"doğru olanı listeden seç.")
        else:
            self.durum.set(f"İşveren seçildi: {etiketler[0]}")

    def hesapla(self):
        try:
            if not self.kayitlar:
                self.dosyayi_oku()
            if not self.kayitlar:
                raise ValueError("Önce SGK hizmet dökümünü seç.")
            if not self.v_isveren.get():
                raise ValueError("İşveren seçilmedi.")

            teblig = tarih_coz(self.v_teblig.get())
            karar = tarih_coz(self.v_karar.get())
            borc = para_coz(self.v_borc.get())
            isyeri = self.v_isveren.get().split()[0]

            self.sonuc = hesapla(self.kayitlar, isyeri, teblig, karar,
                                 borc, self.ayarlar, self.kisi,
                                 kusur=KUSUR_KOD.get(self.v_kusur.get(),
                                                     "cevap-yok"))
            self._sonucu_goster()
            s = self.sonuc
            n = len(s.kalemler)
            if s.pek_ay_sayisi:
                kaynak = (f"{s.pek_ay_sayisi} ayın maaşı SGK kazancından "
                          f"hesaplandı, {n - s.pek_ay_sayisi} ayda asgari ücret")
            else:
                kaynak = "SGK'da her ay tam asgari ücret yazıyor"
            if s.veri_yok_ay:
                kaynak += f" — DİKKAT: {s.veri_yok_ay} ayda kazanç bilgisi yok"
            self.durum.set(f"Hesaplandı ({kaynak}) — {n} ay, "
                           f"toplam {tl(s.toplam)} TL, "
                           f"borçlandırma {tl(s.borclandirma)} TL")
        except Exception as e:
            self.sonuc = None
            self._hata("Hesaplanamadı", e)

    def _sonucu_goster(self):
        s = self.sonuc
        self.tablo.delete(*self.tablo.get_children())
        for k in s.kalemler:
            isaret = {
                "pek": "MAAŞI SGK KAZANCINDAN HESAPLANDI — Uyarılar'a bak",
                "asgari": "SGK'da tam asgari ücret yazıyor",
                "veri-yok": "!!! KAZANÇ BİLGİSİ YOK — Uyarılar'a bak",
            }.get(k.net_kaynak, "")
            not_ = k.aciklama
            if isaret:
                not_ = (not_ + "  |  " if not_ else "") + isaret
            etiket = {"pek": ("pekten",), "asgari": ("teyitli",),
                      "veri-yok": ("dikkat",)}.get(k.net_kaynak, ())
            self.tablo.insert("", "end", tags=etiket,
                              values=(f"{k.ay_adi} {k.yil}", k.gun, tl(k.pek_30),
                                      tl(k.net), tl(k.ceyrek), tl(k.tutar), not_))
        self.tablo.insert("", "end", values=("", "", "", "", "", "", ""))
        self.tablo.insert("", "end", tags=("toplam",),
                          values=("TOPLAM", "", "", "", "", tl(s.toplam),
                                  "kesilmesi gerekip kesilmeyen"))
        if borc_girildi(s):
            self.tablo.insert("", "end", tags=("toplam",),
                              values=("Dosya borcu", "", "", "", "",
                                      tl(s.dosya_borcu), ""))
            ust = ("dosya borcu üst sınır olduğu için"
                   if s.borclandirma < s.toplam
                   else "toplam dosya borcunu aşmadığı için")
        else:
            # Bos birakildi: "0,00 TL dosya borcu" diye bir sey YAZILMIYOR,
            # ne ekranda ne Word'de. Cikan tutar oldugu gibi borclandiriliyor.
            ust = "dosya borcu girilmedi, çıkan tutarın tamamı"
        self.tablo.insert("", "end", tags=("sonuc",),
                          values=("BORÇLANDIRMA", "", "", "", "", tl(s.borclandirma),
                                  f"{ust} (faiz ve harç hariç)"))

        self.metin.delete("1.0", "end")
        self.metin.insert("1.0", tutanak_metni(s))

        self.uyari_kutu.delete("1.0", "end")
        tum = [f"[dosya okuma] {u}" for u in self.okuma_uyarilari] + \
              [f"[hesap] {u}" for u in s.uyarilar]
        tum.append(f"[bilgi] Çalışma bitişi: {s.calisma_bitisi}")
        tum.append(f"[bilgi] Seçilen işyeri: {s.isyeri}")
        tum.append("[bilgi] Maaş kaynağı: SGK hizmet dökümünün kendisi (PEK "
                   "sütunu). Program dışarıdan maaş sormuyor, varsayım "
                   "yapmıyor.")
        if len(self.isverenler) > 1:
            tum.append(f"[bilgi] Bu aralıkta {len(self.isverenler)} işveren vardı, "
                       f"biri seçildi.")
        self.uyari_kutu.insert("1.0", "\n".join(tum) if tum
                               else "Uyarı yok, her ay temiz okundu.")
        self.nb.select(0)

    def metni_kopyala(self):
        if not self.sonuc:
            messagebox.showinfo("Önce hesapla", "Henüz bir hesap yok.")
            return
        self.clipboard_clear()
        self.clipboard_append(self.metin.get("1.0", "end-1c"))
        self.durum.set("Tutanak metni panoya kopyalandı.")

    def _bilgi_sozlugu(self):
        d = {k: v.get().strip() for k, v in self.v_bilgi.items()}
        d["dosya_no"] = self._dosya_no()      # iki kutudan birlesiyor
        return d

    def _kaydet_yolu(self, uzanti, ad_parca):
        varsayilan = f"{ad_parca}{uzanti}"
        return filedialog.asksaveasfilename(
            defaultextension=uzanti, initialdir=KLASOR, initialfile=varsayilan,
            filetypes=[(uzanti.upper()[1:] + " dosyası", "*" + uzanti)])

    def _ad_parca(self):
        d = self._bilgi_sozlugu()
        parcalar = [p for p in (d.get("dosya_no"), d.get("borclu") or self.kisi) if p]
        temiz = "_".join(parcalar).replace("/", "-").replace("\\", "-")
        return (temiz or "tensip") + "_tensip"

    def worde_aktar(self):
        if not self.sonuc:
            messagebox.showinfo("Önce hesapla", "Henüz bir hesap yok.")
            return
        yol = self._kaydet_yolu(".docx", self._ad_parca())
        if not yol:
            return
        try:
            _, punto, sigar = disa_aktar.word_yaz(
                yol, self.sonuc, self._bilgi_sozlugu(), ek=self.v_ek.get())
            nerede = ("hesap dökümü eki 2. sayfada"
                      if self.v_ek.get() else "tek sayfa")
            self.durum.set(f"Word kaydedildi ({str(punto).replace('.', ',')} "
                           f"punto, {nerede}): {yol}")
            # Susmak yasak: icerik cok uzunsa tutanak tek sayfaya SIGMAZ.
            if not sigar:
                messagebox.showwarning(
                    "Tek sayfaya sığmadı",
                    "Tutanak metni çok uzun (çok ay veya çok uzun unvan).\n\n"
                    "En küçük punto (9) ile bile tek sayfaya sığmadı, "
                    "belge 2 sayfa oldu.\n\n"
                    "Daha fazla küçültülürse okunmaz hale gelirdi, "
                    "o yüzden küçültülmedi.")
            self._ac_sor(yol)
        except Exception as e:
            traceback.print_exc()
            self._hata("Word yazılamadı", e)

    def excele_aktar(self):
        if not self.sonuc:
            messagebox.showinfo("Önce hesapla", "Henüz bir hesap yok.")
            return
        yol = self._kaydet_yolu(".xlsx", self._ad_parca().replace("_tensip", "_hesap"))
        if not yol:
            return
        try:
            disa_aktar.excel_yaz(yol, self.sonuc, self._bilgi_sozlugu())
            self.durum.set(f"Excel kaydedildi: {yol}")
            self._ac_sor(yol)
        except Exception as e:
            traceback.print_exc()
            self._hata("Excel yazılamadı", e)

    def _ac_sor(self, yol):
        if messagebox.askyesno("Kaydedildi", f"{os.path.basename(yol)} kaydedildi.\n\nAçılsın mı?"):
            os.startfile(yol)

    def ayarlari_ac(self):
        yol = os.path.join(KLASOR, "ayarlar.json")
        messagebox.showinfo(
            "Asgari ücret tablosu",
            "ayarlar.json açılacak.\n\nYeni yıl geldiğinde 'donemler' listesine "
            "bir satır ekle:\n\n"
            '  { "baslangic": "2027-01", "net": ..., "ceyrek": ... }\n\n'
            "'ceyrek' yazmazsan program net'in 1/4'ünü kendi hesaplar.\n"
            "Dairenin kullandığı rakam farklıysa 'ceyrek'i elle yaz.\n\n"
            "Kaydettikten sonra programı kapatıp aç.")
        subprocess.Popen(["notepad.exe", yol])


if __name__ == "__main__":
    uyg = Uygulama()
    if "--demo" in sys.argv:            # deneme: bilinen dosyayi doldurup hesaplar
        uyg.v_teblig.set("25.11.2025")
        uyg.v_karar.set("28.08.2026")
        uyg.v_borc.set("33.121,92")
        uyg.v_bilgi["il"].set("ornekil")          # kucuk yazilsa da Word'e BUYUK gider
        uyg.v_bilgi["daire"].set("3")             # "3. İCRA DAİRESİ" olur
        uyg.v_dosya_yil.set("2025")
        uyg.v_dosya_sira.set("10000")
        uyg.after(300, lambda: (uyg.isverenleri_yenile(), uyg.hesapla()))
    uyg.mainloop()
