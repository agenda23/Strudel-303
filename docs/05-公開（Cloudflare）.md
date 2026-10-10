# 5. 公開（Cloudflare Pages / Workers）

アプリは静的ファイルだけで動くため（サーバー側の処理なし）、`npm run build` でできる `dist/` をそのまま配信できます。本番ビルドを `vite preview` で動かし、ワークレットの読み込み、`tb303` の登録、再生（ピーク 1.28 / RMS 0.196）まで確認済みです。

## Cloudflare Pages（ダッシュボード）

| 項目 | 値 |
| --- | --- |
| ビルドコマンド | `npm run build` |
| ビルド出力ディレクトリ | `dist` |
| 環境変数 | `NODE_VERSION` = `22`（リポジトリの `.node-version` でも指定済み。Vite 8 は Node 20.19 以上が必要） |

## Cloudflare Workers（静的アセット）

```bash
npm run build
npx wrangler deploy
```

設定は `wrangler.toml`（`assets.directory = "./dist"`、SPA フォールバック）。

## 注意点

- **COOP/COEP ヘッダーは付けないでください**。外部サンプル（GitHub）の取得が壊れます。開発サーバーの設定からも外しました。
- **MCP（AI エージェント連携）は使えません**。MCP サーバーは各自の PC で動く Node プロセスで、許可する Origin も `localhost:3000` / `:4173` に限定しています。公開版では既定でオフのままです。
- **Gemini API キー**はブラウザから直接送信されます。利用者が自分のキーを入力する前提で、サイト側にはキーを置きません。サイト側でキーを持つ場合は、認証とレート制限付きの Workers プロキシが必要です。
- **ライセンス（AGPL-3.0-or-later）**: 公開する場合はソースの入手先を利用者に示す必要があります。ヘッダーの **SOURCE** リンクが `https://github.com/agenda23/Strudel-303` を指します。フォークや別リポジトリで公開する場合は `src/main.ts` のリンクを書き換えてください。
- **サンプル**は初回に GitHub（`tidal-drum-machines`、`dirt-samples`）から取得します。オフラインでは 909 が鳴りません。
