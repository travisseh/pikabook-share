# pikabook-share

Photobook sharing + feedback backend for the [PikaSync POC](https://github.com/travisseh/pikasync-poc). A book saved on the phone can be uploaded and shared as a web link; anyone with the link can view the book and leave per-photo or whole-book feedback. In-app feedback from PikaSync lands in the same table.

## Architecture

- **Convex** (project `pikabook-share`, prod deployment `silent-marmot-268`): tables `books`, `pages` (JPEGs in Convex storage), `feedback`. HTTP actions for the app: `POST /create-book` → shareId + per-page upload URLs, `POST /finalize-book`, `POST /feedback`.
- **Next.js share page** (Vercel, https://pikabook-share.vercel.app): `/b/[shareId]` renders the book; tapping a photo opens a feedback sheet (reaction + optional text + optional name). No login — the unguessable shareId is the capability.

## Reading feedback

- Convex dashboard → data → `feedback`, or run the `books:allFeedback` query with a shareId:
  `npx convex run books:allFeedback '{"shareId": "<id>"}' --prod`

## Dev

```sh
npm install
npx convex dev        # dev deployment + codegen
npm run dev           # Next.js against .env.local
npx convex deploy     # push functions to prod
vercel --prod         # deploy the share page
```

`NEXT_PUBLIC_CONVEX_URL` for prod lives in `.env.production` (public by nature).
