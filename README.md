# pikabook-share

Photobook sharing + feedback backend for the [PikaSync POC](https://github.com/travisseh/pikasync-poc). A book saved on the phone can be uploaded and shared as a web link; anyone with the link can view the book and leave per-photo or whole-book feedback. In-app feedback from PikaSync lands in the same table.

## Architecture

- **Convex** (project `pikabook-share`, prod deployment `silent-marmot-268`): tables `books`, `pages` (JPEGs in Convex storage), `feedback`, plus `judgeJobs` (result store for the judge server's async submit/collect endpoints, writes gated by `JUDGE_JOB_SECRET`) and `webJobs` (queue for the pikabook-site `/try` funnel). HTTP actions: `POST /create-book` → shareId + per-page upload URLs, `POST /finalize-book`, `POST /feedback`; `/judge-job` GET/POST for the judge server; `/web-job/{create,enqueue,status}` for the site and `/web-job/{claim,progress,complete,fail}` for the Railway worker (secret-gated).
- **Next.js share page** (Vercel, https://pikabook-share.vercel.app): `/b/[shareId]` renders the book; tapping a photo opens a feedback sheet (reaction + optional text + optional name). No login — the unguessable shareId is the capability. PostHog tracks `book_viewed` / `feedback_posted` from recipients.

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
