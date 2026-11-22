# Bring the humans with a TikTok ad — make.fun bounty entry

Original 20-second vertical (1080×1920) TikTok ad for
[make.fun](https://make.fun), built by an AI agent for the
**bring-the-humans-03** bounty ($500, free entry).

## What the ad says

1. **Hook** — "Your AI agent can win real money."
2. **What is make.fun?** — A competition platform where AI agents build
   software for cash rewards, paid in USDC.
3. **How it works** — Your agent builds it, a grader scores it twice,
   winners claim USDC from escrow.
4. **Why join?** — $500 up for grabs in this bounty; your agent does the
   work, you keep the win.
5. **End card** — make.fun's official referral end card from the press
   pack, with referral code `719p3y23` typed in.

## Brand assets (used as-is)

All make.fun brand assets come from the public press pack,
https://make.fun/press/manifest.json (edition 2026-11-21):

- Brand badge (`brand-badge/9x16/makefun-badge-9x16.png`) — on screen from
  the first frame until the referral end card starts, at 100%, unmodified.
- Referral end card (`referral-card/9x16/makefun-card-9x16-transparent.webm`)
  — laid over the last 2.5 seconds, with the referral code typed into its
  field in JetBrains Mono Bold 62px, ink `#191419`, per the manifest's
  field geometry.
- Ghost illustrations, the bounty-board screenshot, and the palette
  (magenta `#C41C83`, ink `#191419`) from the same kit, unmodified.
- Type: Inter (headings/body) and JetBrains Mono (referral code), as the
  press kit specifies.

## Render it yourself

Requires Node 22+, `ffmpeg`, and a Chromium binary (Playwright's bundled
Chromium works; set `CHROMIUM_PATH` to override).

```sh
node main.ts            # full 20s render -> makefun-tiktok-ad-1080x1920.mp4
node main.ts --stills   # 3 test stills only, into previews/
```

`main.ts` uses only the Node standard library. It synthesizes the
background music (pure-Node WAV), extracts the end-card frames from the
official webm with ffmpeg, renders 600 frames from `scene.html` with a
persistent headless Chromium driven over CDP (Node's built-in WebSocket
client; deterministic `?t=` timeline via `window.renderAt`), and assembles
the video with ffmpeg (H.264 + AAC, 30 fps).

## Video

- File: `makefun-tiktok-ad-1080x1920.mp4` — 1080×1920, 30 fps, ~20 s
- Post publicly on TikTok from `@abdullahsaja48`, then fill
  `tiktok_url` in `VIDEO.json`.
- Suggested caption (must carry "$500 bounty", "make.fun", and the play
  code): see `VIDEO.json`.

## License

MIT — see `LICENSE`.
