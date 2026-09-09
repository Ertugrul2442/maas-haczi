# Maaş Haczi — İşveren Sorumluluk Hesabı (İİK 355-356)

Maaş haciz müzekkeresine cevap vermeyen ya da kesinti yapmayan işverenin,
**kesmesi gerekip de kesmediği** paradan doğan sorumluluğunu SGK hizmet
dökümünden ay ay hesaplar. İcra dairelerinde elle yapılan bir işi
otomatikleştirir.

Mahkemeler bu tespiti icra müdürlüğünün görevi sayıyor:

> "icra memuru SGK kayıtlarını UYAP üzerinden temin ederek ya da gerekli
> yazışmayı yaparak borçlunun SGK hizmet dökümüne ulaşmalı ve iş verenin
> sorumlu olduğu miktarı tespit etmelidir."
>
> — Manisa 1. İcra Hukuk Mahkemesi, 2023/332 E - 2023/382 K (kesin)

## Hesap nasıl yürüyor

Her ay için zincir şu:

1. **Kazanç** — SGK hizmet dökümünün `PEK` (prime esas kazanç) sütunundan
   okunur. Program dışarıdan maaş sormaz, varsayım yapmaz.
2. **Net ücret** — kazanç tam asgari ücretse o dönemin yayımlanmış net asgari
   ücreti; farklıysa kanunun formülüyle hesaplanır (GVK m.103 tarifesi +
   23/1-18 asgari ücret istisnası + 319 s. Genel Tebliğ usulü + damga vergisi).
   Gelir vergisi kümülatif matraha göre arttığı için **aynı brüt her ay farklı
   net verir**.
3. **1/4** — İİK 83/2 haczedilecek miktarın dörtte birinden az olamayacağını,
   İş Kanunu 35 dörtte birinden fazlasının haczedilemeyeceğini söylüyor. İşçide
   ikisi birleşince oran tam 1/4 oluyor. Küsurat **aşağı kırpılır** (1/4 yasal
   üst sınır, aşılmamalı).
4. **Gün** — ay 30 gün sayılır, tutar `1/4 ÷ 30 × gün`. Tebliğ ayında tebliğden
   sonraki günler, karar ayında karar gününe kadar.
5. **Toplam** — dosya borcunu aşamaz (Yargıtay 12. HD E.2016/25199,
   K.2017/15840: sorumluluk kesilmeyen tutarla sınırlı).

Sonuç Word tutanağı ve Excel dökümü olarak dışa aktarılır.

## Çalıştırma

```
py -3.13 arayuz.py            # arayüz
py -3.13 arayuz.py --demo     # deneme verisiyle
```

`Maas Haczi.bat` çift tıklanarak da açılır. `exe_yap.bat` tek dosyalık
dağıtım sürümü üretir (önce beş testi koşar, biri düşerse exe yapmaz).

## Testler

```
py -3.13 test_hesap.py        # gerçek bir mahkeme kararına karşı, 9 satır birebir
py -3.13 test_net_maas.py     # net ücret hesabı, 60/60 ay resmî net asgari ücretle
py -3.13 test_pekten_net.py   # SGK kazancından ay ay net
py -3.13 test_ilk_ay.py       # tebliğ ayı kuralı
py -3.13 test_veri_cek.py     # veri çekicinin güvenlik kontrolleri (ağa çıkmaz)
```

## Yıllık veri güncellemesi

Asgari ücret ve gelir vergisi tarifesi resmî kaynaktan çekilebiliyor:

```
py -3.13 veri_cek.py          # çeker, doğrular, değiştiyse ayarlar.json'a yazar
py -3.13 veri_cek.py --kuru   # sadece gösterir, yazmaz
```

Kaynaklar (anahtarsız, kayıtsız):

| Veri | Kaynak |
|---|---|
| Brüt ve net asgari ücret | Çalışma ve Sosyal Güvenlik Bakanlığı |
| Gelir vergisi tarifesi | Gelir İdaresi Başkanlığı (yıllık PDF) |

Çekilen veri makullük kontrollerinden geçmezse **hiçbir şey yazılmaz**, eski
veri olduğu gibi kalır. Ayrıntı: `veri_cek.py` başındaki açıklama.

## Kapsam

Yalnız **4a (işçi)** kayıtları hesaplanır. Memur/kamu (4c) dosyalarında SGK'ya
bildirilen kazanç maaşı yansıtmadığı için program hesap yapmaz, uyarı verir.
İİK 356 yalnız maaş ve ücret için işler; kıdem/ihbar tazminatı ve emekli
ikramiyesi bu maddenin dışındadır.

## Gizlilik

Bu depoda gerçek dosyalara ait hiçbir veri yoktur. SGK hizmet dökümleri,
üretilen tutanaklar ve karar görselleri `.gitignore` ile dışarıda tutulur.
Program tamamen yerel çalışır; hesaplanan hiçbir bilgi dışarı gönderilmez.
Tek ağ erişimi `veri_cek.py`'nin resmî kaynaklardan asgari ücret ve vergi
tarifesi çekmesidir.
