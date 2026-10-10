# Strudel 303

[Strudel](https://strudel.cc) をベースにした、ブラウザで動くアシッドテクノ作曲ツールです。自作の **Roland TB-303 風モノシンセ**（AudioWorklet）と、Strudel 標準の **TR-909 ドラム**・パターン言語を、コードだけで同期して鳴らせます。

## 特長

- **PolyBLEP VCO**: エイリアシングを抑えたノコギリ波／矩形波。
- **4ポール TPT ダイオードラダーフィルタ**: 段ごとの `tanh` 飽和による非線形レゾナンス。
- **アクセント・スライド**:
  - `slide=1` のノートは、次のノートへエンベロープを再トリガーせずにピッチだけ滑ります（次のノートが続けて始まる場合のみ。間に休符があれば通常の発音）。
  - 2.5ms のマイクロアタックでクリックを抑制。
  - アクセントのコンデンサ充放電を模擬。
- **アシッド歪みユニット**: **RAT**（ダイオードクリップ）／**TUBE**／**FUZZ**。
- **Strudel 統合**: `tb303` は `registerSound` で登録されるため、Strudel 標準のコントロール（`gain` `pan` `lpf` `orbit` `duck` など）がそのまま効きます。プリセットでは delay / room は使いません。
- **Strudel 互換の表示・操作**: 再生中ステップのハイライト、`.pianoroll()` / `.scope()`、`$:` / `_$:` / 名前付きブロック / `.p()` / `all()`、`setcps` / `setcpm`。
- **テンポ**: 130〜145 BPM を想定（既定 138 BPM）。画面の TEMPO から再評価なしで変更できます。
- **909 ドラム**: ハイハットのチョーク（`.cut(1)`）を含むテクノ向けパターン。
- **MCP ブリッジ**: AI エージェントから作曲するためのローカル WebSocket（`127.0.0.1` 限定）。既定ではオフで、`?mcp=1` を付けて開く（または `localStorage.tb303_mcp = '1'`）と有効になります。

## はじめかた

```bash
# 1. 依存関係をインストール
npm install

# 2. 開発サーバーを起動
npm run dev

# 3. ブラウザで開く
# http://localhost:3000
```

画面の **EVAL**（または `Ctrl+Enter`）で再生、**STOP**（または `Ctrl+.` / `Esc`）で停止します。

## マニュアル

[`docs/`](./docs/README.md) にマニュアルがあります（はじめに／パターンの書き方／AI 機能／トラブルシューティング）。AI パターン生成と MCP による AI エージェント連携の使いかたは [AI 機能](./docs/03-AI機能.md) を参照してください。

## テスト・ビルド

```bash
# 単体テスト（DSP・スライド意味論・Strudel 互換スニペット）
npm test

# 本番ビルド
npm run build
```

## パターンの書き方

```javascript
// ⚡ 138 BPM クラシック・アシッド
setcps(138/60/4)

$: n("0 0 7 4 ~ 2 3 0").scale("c2:minor")
  .s("tb303")
  .accent("0 1 0 0 0 1 0 0")
  .slide("0 0 1 0 0 0 1 0")
  .tbcut(sine.range(280, 3400).slow(4))
  .tbres(0.85)
  .tbenv(0.68)
  .tbdec(0.24)
  .gain(0.9)

$: s("bd*4, ~ cp ~ cp").bank("RolandTR909").gain(0.6)
$: s("hh*8, [~ oh]*4").bank("RolandTR909").gain(0.35).cut(1)
```

`cut(1)` はハイハット系（`hh` / `oh` / `rd`）だけに掛けてください。キックやクラップと同じブロックに掛けると、ハイハットで切られてしまいます。

### 303 のパラメータ

| パラメータ | 型 / 範囲 | 説明 |
|---|---|---|
| `.s("tb303")` | 文字列 | ノートを 303 シンセ（AudioWorklet）で鳴らす |
| `.accent(...)` | `0` / `1` | アクセント。フィルタの開きと音量が増す |
| `.slide(...)` | `0` / `1` | そのステップから**次のステップへ**スライド（エンベロープは再トリガーしない） |
| `.tbcut(...)` | `50`〜`8000`（Hz） | フィルタのカットオフ（`sine` などで変調可） |
| `.tbres(...)` | `0.0`〜`1.0` | レゾナンス |
| `.tbenv(...)` | `0.0`〜`1.0` | フィルタ・エンベロープの深さ（Env Mod） |
| `.tbdec(...)` | `0.1`〜`2.0`（秒） | フィルタ・エンベロープのディケイ |
| `.tbwave(...)` | `"saw"` \| `"square"` | 波形 |
| `.tbslidetime(...)` | 秒（既定 0.06） | スライド時間 |
| `.tbdist(...)` | `0.0`〜`1.0` | 歪みの量 |
| `.tbdisttone(...)` | `0.0`〜`1.0` | 歪みのトーン |
| `.tbdistmix(...)` | `0.0`〜`1.0` | 歪みのウェット／ドライ |
| `.tbdisttype(...)` | `"rat"` \| `"tube"` \| `"fuzz"` | 歪みの種類 |

### Strudel 標準コントロールの扱い

| コントロール | 303 での扱い |
|---|---|
| `note` / `n().scale()` | Strudel と同じ音程解決（既定 C2）。`n()` だけの場合は「C2 からの半音数」として扱い、初回に警告 |
| `clip` / `legato` | ゲート長（既定はイベント長の 0.85 倍） |
| `gain` `velocity` `pan` `orbit` `duck` など | superdough のチェーンが適用 |
| `lpf` `hpf` `shape` など | 303 内蔵フィルタの**後段**に掛かる（内蔵フィルタは `tbcut` / `tbres`） |

詳細は [`spec/互換仕様.md`](./spec/互換仕様.md) を参照してください。

## 構成

- `src/dsp/`: Web Audio に依存しない純 TypeScript の DSP コア（`polyblep.ts` `ladder.ts` `tb303.ts` `distortion.ts`）。
- `src/worklet/tb303.worklet.ts`: AudioWorklet プロセッサ。Vite の worker 機能でバンドルし、`dsp/` を直接使う（コピーなし）。
- `src/strudel/trigger.ts`: Strudel のイベント値を 303 のトリガーに変換する純関数（音程解決・スライド判定）。
- `src/strudel/bridge.ts`: `registerSound('tb303')` と、常駐ワークレットへのサンプル精度のイベント送信。
- `src/strudel/controls-def.ts`: 303 固有コントロールの定義。
- `src/app/`: エディタ（CodeMirror）、ステップのハイライト、プリセット、マニュアル、AI アシスタント。
- `mcp/server.ts`: ローカル MCP サーバー（`127.0.0.1`、Origin を完全一致で検証）。
- `tools/render.ts`: DSP をオフラインで WAV に書き出す開発用ツール（回帰確認用）。
- `spec/`: 仕様書・改修計画書・調査記録・互換仕様。

## ライセンス

[GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）](./LICENSE)。`@strudel/web` と `superdough` が AGPL のため、これに合わせています。公開する場合はソースコードの入手方法も明記してください。
