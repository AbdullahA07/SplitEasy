# 💰 SplitEasy

A Splitwise-like web app to split expenses with friends and groups. Built with vanilla HTML/CSS/JS and Supabase.

## Features

- 🔐 Email/password authentication
- 👥 Create groups, add members by email
- 💸 Add expenses with equal, exact, or percentage splits
- ✅ Settle debts between members
- 📊 Dashboard with live balances
- ⚡ Real-time sync — changes appear instantly for all group members
- 📋 Full activity history

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (no build tools)
- **Backend:** [Supabase](https://supabase.com) (Auth + PostgreSQL + Real-time)
- **Hosting:** Any static host (Netlify, Vercel, GitHub Pages)

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/splitwise-clone.git
cd splitwise-clone
```

### 2. Configure Supabase
```bash
cp config.example.js config.js
```
Edit `config.js` and add your Supabase Project URL and Publishable key from **Settings → API**.

### 3. Run the database schema
In Supabase: **Database → SQL Editor → New Query** → paste the contents of `setup.sql` → Run.

### 4. Open the app
Just open `index.html` in your browser — no build step needed.

## Deploy to Netlify
Drag the project folder onto [netlify.com](https://netlify.com/drop) — you get a live URL instantly.

> ⚠️ Never commit your real `config.js` — it's in `.gitignore`. Share `config.example.js` instead.
