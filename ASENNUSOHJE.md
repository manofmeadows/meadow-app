# 🌿 Meadow – Asennusohje

Tämä ohje vie sinut nollasta toimivaan sovellukseen. Aikaa menee ~15 minuuttia.

Tarvitset kolme **ilmaista** tiliä: GitHub, Supabase, Vercel.

---

## VAIHE 1: GitHub-tili ja koodin lataus (5 min)

### 1.1 Luo GitHub-tili
1. Mene: **github.com**
2. Klikkaa **Sign up**
3. Täytä sähköposti, salasana, käyttäjänimi
4. Vahvista sähköpostista

### 1.2 Luo uusi repository
1. Kun olet kirjautunut, klikkaa oikeasta yläkulmasta **+** → **New repository**
2. Repository name: **meadow-app**
3. Valitse **Private** (yksityinen)
4. Klikkaa **Create repository**

### 1.3 Lataa koodi GitHubiin
1. Avaa juuri luomasi repository (github.com/SINUN-NIMESI/meadow-app)
2. Klikkaa **uploading an existing file** -linkkiä
3. Vedä KAIKKI meadow-app -kansion tiedostot ja kansiot tähän
   - Varmista että mukana on: `package.json`, `vite.config.js`, `src/`-kansio, `index.html`, jne.
   - ÄLÄ lataa `supabase_schema.sql` -tiedostoa (se on vain sinulle)
   - ÄLÄ lataa `.env.example` -tiedostoa
   - ÄLÄ lataa tätä ohjetta
4. Klikkaa **Commit changes**

---

## VAIHE 2: Supabase-tietokanta (5 min)

### 2.1 Luo Supabase-tili
1. Mene: **supabase.com**
2. Klikkaa **Start your project** → kirjaudu GitHub-tilillä
3. Klikkaa **New project**
4. Organization: valitse oma
5. Project name: **meadow**
6. Database password: keksi vahva salasana (tallenna se!)
7. Region: **EU West (Ireland)** ← lähin Suomeen
8. Klikkaa **Create new project**
9. Odota ~2 min kun projekti luodaan

### 2.2 Luo tietokantataulut
1. Vasemmasta valikosta klikkaa **SQL Editor** (tietokantaikoni)
2. Klikkaa **New query**
3. Kopioi KOKO `supabase_schema.sql` -tiedoston sisältö tähän
4. Klikkaa **Run** (tai Ctrl+Enter)
5. Pitäisi näkyä: "Success. No rows returned"

### 2.3 Kopioi API-avaimet
1. Vasemmasta valikosta: **Project Settings** (rattaan kuva) → **API**
2. Kopioi talteen kaksi asiaa:
   - **Project URL** (näyttää: `https://xxxxx.supabase.co`)
   - **anon public** -avain (pitkä `eyJ...` -merkkijono kohdassa "Project API keys")

---

## VAIHE 3: Vercel-julkaisu (5 min)

### 3.1 Luo Vercel-tili
1. Mene: **vercel.com**
2. Klikkaa **Sign Up** → **Continue with GitHub**
3. Hyväksy yhteys

### 3.2 Tuo projekti
1. Klikkaa **Add New...** → **Project**
2. Näet GitHub-repositorisi. Klikkaa **Import** kohdasta **meadow-app**
3. **Framework Preset**: Vite (pitäisi tunnistaa automaattisesti)

### 3.3 Aseta ympäristömuuttujat
Ennen kuin painat Deploy, lisää **Environment Variables**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` (vaihe 2.3:sta) |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` (vaihe 2.3:sta) |
| `VITE_APP_PIN` | Valitse PIN-koodi, esim. `2468` |

Klikkaa jokaisen kohdalla **Add**.

### 3.4 Deploy!
1. Klikkaa **Deploy**
2. Odota ~1-2 min
3. Saat linkin: **meadow-app-xxxxx.vercel.app**
4. Klikkaa linkkiä → sovellus aukeaa!
5. Syötä PIN-koodi jonka asetit → olet sisällä

---

## VAIHE 4: Lisää puhelimen kotinäytölle (1 min)

### iPhone:
1. Avaa sovelluksen URL Safarissa
2. Napauta jakamispainiketta (neliö + nuoli ylös)
3. Valitse **Lisää kotivalikkoon**

### Android:
1. Avaa sovelluksen URL Chromessa
2. Napauta kolmea pistettä → **Lisää aloitusnäytölle**

Nyt sovellus toimii kuin oikea appi – ilman App Storea!

---

## 🔧 VIANMÄÄRITYS

**"Ladataan..." jää pyörimään:**
→ Tarkista Vercelin ympäristömuuttujat (VITE_SUPABASE_URL ja VITE_SUPABASE_ANON_KEY)
→ Tarkista että SQL-schema on ajettu Supabasessa

**Data ei synkkaa laitteiden välillä:**
→ Varmista että supabase_schema.sql:n viimeiset rivit (alter publication) on ajettu
→ Supabasessa: Database → Replication → Varmista että taulut ovat enabled

**PIN-koodi ei toimi:**
→ Tarkista VITE_APP_PIN Vercelin ympäristömuuttujista
→ Muutoksen jälkeen: Vercel → Deployments → Redeploy

**Haluan vaihtaa PIN-koodin:**
→ Vercel → Settings → Environment Variables → muuta VITE_APP_PIN → Deployments → Redeploy

---

## 📱 KÄYTTÖ

Sovellusta käytetään kahdesta paikasta:
1. **Puhelin** – tuotannon kirjaus, saldojen tarkistus, tilausten seuranta
2. **Tietokone** – sama URL, sama data, synkkaa reaaliaikaisesti

Kun yksi henkilö kirjaa tuotannon puhelimella, toinen näkee muutoksen tietokoneella sekunnissa.

---

*Kaikki data on Supabasessa EU-palvelimella. Sovellus on yksityinen (PIN-suojattu) ja ilmainen.*
