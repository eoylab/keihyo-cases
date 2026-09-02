# keihyo-cases

**景品表示法（不当景品類及び不当表示防止法）の措置命令・課徴金納付命令のデータセットと MCP サーバー**

消費者庁が公表した処分 **151件**（128社、2021-04-09〜2026-08-06）を、
機械可読な形にしたものです。全件に出典URLがあります。

→ **[検索できる一覧](https://eoylab.github.io/keihyo-cases/)**

*A machine-readable dataset of Japanese advertising-law (Keihyoho) enforcement
actions published by the Consumer Affairs Agency, plus an MCP server so a model
can cite a real order instead of inventing one. Japanese-language source data.*

## これは何をしないか

**違反の判定をしません。** 各レコードは、消費者庁が**既に発出して公表した処分**の再記述です。
「この表示は違反にあたる」という判断は含みません。

過去の処分の一覧は、個別の広告表現が適法かどうかの答えにはなりません。
消費者庁自身が個別事案ごとの判断という立場を取っています。

## なぜあるか

広告表示のチェックを LLM にやらせると、**実在しない処分事例を作ります。**
根拠になる機械可読なデータが無いからです。
このデータセットは、モデルが**思い出す代わりに引用できる**ものを置くために作りました。

## 使う

### MCP サーバー（Claude Desktop / Claude Code など）

```json
{
  "mcpServers": {
    "keihyo-cases": {
      "command": "npx",
      "args": ["-y", "github:eoylab/keihyo-cases", "keihyo-mcp"]
    }
  }
}
```

依存パッケージはありません。ネットワークにも出ません（同梱の JSON だけを読みます）。

| ツール | 何を返すか |
|---|---|
| `search_cases` | 事業者名・商品名・条項・公表日・処分種別で絞り込み |
| `get_case` | id で1件 |
| `list_recent` | 公表日の新しい順 |
| `stats` | 年度別・処分種別・条項別の件数 |

### データを直接使う

| ファイル | |
|---|---|
| [`data/cases.json`](data/cases.json) | 全件（配列） |
| [`data/cases.jsonl`](data/cases.jsonl) | 1行1件 |
| [`data/cases.csv`](data/cases.csv) | 表形式 |
| [`data/unparsed.json`](data/unparsed.json) | レコードにならなかった発表と、その理由 |
| [`data/meta.json`](data/meta.json) | 件数・取得範囲・出典 |

### 1レコードの形

```json
{
  "id": "047140",
  "url": "https://www.caa.go.jp/notice/entry/047140/",
  "published_date": "2026-08-06",
  "company": "「SNOW」と称するアプリケーションの利用サービスの提供事業者2社",
  "order_type": "措置命令",
  "provisions": [
    "第5条第3号(ステルスマーケティング告示)",
    "第7条第1項"
  ],
  "product": {
    "name": "SNOW",
    "kind": "アプリケーションの利用サービスの提供事業者2社に対し"
  },
  "lead_text": "消費者庁は、本日、「SNOW」と称するアプリケーションの利用サービスの提供事業者2社に対し、両社が供給する「SNOW」と称するアプリケーションの利用サービスに係る表示について、それぞれ、景品表示法に違反する行為(同法第5条第3号(ステルスマーケティング告示)に該当)が認められたことから、同法第7条第1項の規定に基づき、措置命令を行いました。",
  "authority": "消費者庁"
}
```

`title` と `lead_text` は公表ページの**記載そのまま**です。

## 内訳

| 処分 | 件数 |
|---|---|
| 措置命令 | 98 |
| 課徴金納付命令 | 53 |

主な条項（1件で複数に該当することがあります）：

- `第7条第1項` … 101件
- `第5条第1号(優良誤認)` … 63件
- `第8条第1項` … 53件
- `第5条第2号(有利誤認)` … 25件
- `第5条第3号(ステルスマーケティング告示)` … 6件
- `第5条第3号(おとり広告)` … 2件

## どう作っているか

**モデルを使っていません。判断もしていません。**
索引ページと個別ページから、読める規則で決定論的に抽出しています（`src/ingest/extract.mjs`）。

- 事業者名は表題の「〈事業者〉に対する」という構成から
- 処分種別は表題中の「措置命令」「課徴金納付命令」の記載から
- 条項は本文中の記載を出現順に、重複を除いて

**抽出できなかった項目は `null` にしてあり、推測で埋めていません。**
レコードとして成立しなかった発表（確約計画の認定、注意喚起など）は
`data/unparsed.json` に理由つきで残しています ——
**注意喚起で名前が出た会社は、何かを命じられたわけではありません。**
処分と並べて置けば、その会社を誤って表すことになります。

更新するには：

```bash
npm run build          # 2020年度以降を取り込む
npm test               # 保存したページに対して逐語一致を検証
```

取得は1リクエスト/秒、連絡先を含む User-Agent で行います。

## 商用利用・Hosted API・日次更新

**元データは消費者庁の[公共データ利用規約（PDL1.0）](https://www.caa.go.jp/terms_of_use/)準拠、
コードは MIT です。現状のデータセットと MCP サーバーは、そのまま商用利用できます。**
許可を買う必要はありません。この無料部分を後から有料に切り替えることもしません。

そのうえで、**こちらが費用を負担する部分**（自前でホストしないエンドポイント、
日次更新と webhook、稼働保証、過去分の遡り、導入支援）に需要があるか知りたい。

**まだ一つも作っていません。** 要るものだけ作りたいので、価格を書いた Issue を置いています。

| | 内容 | 目安 | 投票 |
|---|---|---|---|
| 1 | Hosted API | 月 ¥4,000 | [#1](https://github.com/eoylab/keihyo-cases/issues/1) |
| 2 | 日次更新 / webhook | 月 ¥3,000 | [#2](https://github.com/eoylab/keihyo-cases/issues/2) |
| 3 | 商用ライセンス / SLA | 月 ¥15,000 | [#3](https://github.com/eoylab/keihyo-cases/issues/3) |
| 4 | bulk access / 過去分 | 単発 ¥30,000 | [#4](https://github.com/eoylab/keihyo-cases/issues/4) |
| 5 | 導入支援 | 時間 ¥15,000 | [#5](https://github.com/eoylab/keihyo-cases/issues/5) |

使いたいものに **👍** を付けてください。条件があればコメントでどうぞ。
一覧に無いものが今週必要なら [Issue を立ててください](https://github.com/eoylab/keihyo-cases/issues/new) —
仕組みが無いだけで、データはもうあります。

詳細: <https://eoylab.github.io/keihyo-cases/commercial.html>

## 出典とライセンス

**出典: 消費者庁ウェブサイト**（各レコードの `url` が一次情報）

元データは[公共データ利用規約（第1.0版）](https://www.caa.go.jp/terms_of_use/)に準拠します。
**編集・加工の主体は keihyo-cases です。** 詳細は [DATA-LICENSE.md](DATA-LICENSE.md)。

コードは MIT。

## 既知の限界

- **PDF の本文は含みません。** 公表ページの PDF リンクはスクリプトで挿入されており、
  配信される HTML に無いため `pdf_url` は多くが `null` です。**推測で URL を作っていません**
- **2020年度以前の索引が空です。** URL の構造が違う可能性があり、未確認
- **課徴金の金額は含みません。** 発表本文ではなく PDF 側にあるため
