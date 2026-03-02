# AI Restaurant Menu OCR

## Overview
Web app that:
- Uploads menu images and extracts dish names using OCR
- Stores dishes per restaurant in a lightweight JSON DB
- Supports admin login (JWT), add restaurant, upload image, edit items
- Provides search across restaurants (substring + fuzzy match)

## Tech
- Frontend: React + Vite (client/)
- Backend: Node.js + Express (server/)
- OCR: tesseract.js
- Storage: lowdb JSON file (server/db.json)

## Run Locally
1) Backend
```
cd server
set PORT=4002 && npm run dev
```
Health: http://localhost:4002/api/health

2) Frontend
```
cd client
npm run dev
```
Open http://localhost:5173/

## Admin Flow
- Register: POST /api/auth/register
- Login: POST /api/auth/login → JWT saved in session storage
- Add restaurant: POST /api/restaurants (Bearer token)
- Upload image: POST /api/restaurants/:id/upload (Bearer token)
- Preview menu: GET /api/restaurants/:id/menu
- Edit item: PUT /api/restaurants/:id/menu/:menuId (Bearer token)
- Search: GET /api/search?query=...

## Important
- Use JPEG/PNG images for upload
- server/uploads/ holds temporary files and is ignored
- server/db.json contains local data and is ignored

## Share
- Use the zip created or push to GitHub:
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your_repo_url>
git push -u origin main
```
