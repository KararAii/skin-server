# skin-server

Endpoints:
- POST /api/analyze-skin { imageBase64: dataURL, locale?: 'ar'|'en' }
- POST /api/chat { messages: [{role:'user'|'assistant'|'system', content:string}], locale?: 'ar'|'en' }

Deploy:
1) Create a new Vercel project from this folder.
2) Environment Variables:
   - OPENAI_API_KEY = <your key>
   - OPENAI_MODEL   = gpt-4o-mini  (optional)
3) Deploy. You will get:
   https://YOUR.vercel.app/api/analyze-skin
   https://YOUR.vercel.app/api/chat

Notes:
- Send images as data URLs (data:image/jpeg;base64,...).
- We do not persist any images on the server; keep logs minimal in prod.
