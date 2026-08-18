# TestFlight 配信手順（Macなしで実機テスト配信する）

> Apple Developer Program に加入済みであれば、**この手順だけでTestFlight配信できます**。
> ビルドはGitHubのmacOSランナーで行うため、手元にMacは不要です。

---

## 0. 何が入っているか

```
ios/
├── project.yml                    XcodeGen のプロジェクト定義
├── Sources/
│   ├── AppDelegate.swift          起動と横持ち固定
│   ├── GameViewController.swift   WKWebViewのシェル（外部リンクはSafariへ）
│   └── BundleSchemeHandler.swift  同梱資産を entrance://app/... で配信
├── Resources/
│   ├── Info.plist                 横持ち専用・全画面・ステータスバー非表示
│   └── Assets.xcassets/           アプリアイコン・起動背景色
└── www/                           ← scripts/build-ios-www.js が生成（Web一式）

scripts/build-ios-www.js           web/ と src/ を ios/www へ構造ごとコピー
.github/workflows/ios-verify.yml   署名なしのビルド検証（シークレット不要）
.github/workflows/ios-testflight.yml  TestFlight配信（手動実行）
```

**設計のポイント**

- WebのUIとルールエンジンを**そのままアプリに同梱**しています。Web版を直せばアプリ版も直ります。
- `file://` ではES Modulesの読み込みがブロックされるため、**独自スキーム（`entrance://app/`）**で配信しています（Capacitorと同じ考え方）。
- 通信は一切しません。**完全オフラインで対局できます**（外部フォントの参照もビルド時に除去）。
- 横持ち固定・全画面・ホームインジケータ自動非表示。

---

## 1. 事前準備（初回だけ・15分程度）

### 1-1. App Store Connect にアプリを登録

1. [App Store Connect](https://appstoreconnect.apple.com/) →「マイApp」→「＋」
2. 入力内容
   - プラットフォーム：iOS
   - 名前：`Entrance`（表示名。重複不可）
   - プライマリ言語：日本語
   - バンドルID：**`com.beqd1106.entrance`**
     （先に [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) で同じIDを登録しておきます）
   - SKU：`entrance-001`

> バンドルIDを変える場合は `ios/project.yml` の `PRODUCT_BUNDLE_IDENTIFIER` と
> `.github/workflows/ios-testflight.yml` の `BUNDLE_ID` の**両方**を書き換えてください。

### 1-2. App Store Connect API キーを作る

1. App Store Connect →「ユーザーとアクセス」→「キー」（Integrations → App Store Connect API）
2. 「＋」でキーを生成。アクセス権は **App Manager**
3. 次の3つを控える
   - **Issuer ID**（画面上部のUUID）
   - **Key ID**（生成したキーのID）
   - **`AuthKey_xxxxxxxx.p8`**（1回しかダウンロードできません）

### 1-3. 証明書用の秘密鍵を作る

ローカル（Windowsでも可）で実行：

```bash
openssl genrsa -out cert_key.pem 2048
```

> この鍵から、CIが自動で配布用証明書を作成・取得します（`fetch-signing-files --create`）。
> 鍵はGitHubのシークレットに入れるだけで、リポジトリには置かないでください。

### 1-4. GitHubにシークレットを登録

リポジトリ → Settings → Secrets and variables → Actions → New repository secret

| シークレット名 | 中身 |
| --- | --- |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | Key ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | `AuthKey_xxx.p8` の**中身をそのまま貼り付け**（`-----BEGIN PRIVATE KEY-----` から最後まで） |
| `CERTIFICATE_PRIVATE_KEY` | `cert_key.pem` の**中身をそのまま貼り付け** |

---

## 2. 配信する

```bash
# リポジトリを用意（初回のみ）
cd C:\Users\user\Downloads\JANDOOR   # フォルダ名は任意
git init
git add .
git commit -m "Entrance 初回コミット"
gh repo create beqd1106/entrance --private --source=. --push

# 配信（ワークフローは「ファイル名」で指定する）
gh workflow run ios-testflight.yml -f version=1.0.0
gh run watch
```

処理の流れ：

1. エンジンの自動テスト（58件＋シミュレーション）→ **失敗したら配信しない**
2. `web/` `src/` を `ios/www/` へ配置
3. XcodeGenで `Entrance.xcodeproj` を生成
4. 証明書・プロビジョニングを自動取得（初回は証明書も作成）
5. IPAをビルド（ビルド番号は `github.run_number` を自動採番）
6. TestFlightへアップロード

完了後、App Store Connect → TestFlight にビルドが上がります（処理に5〜15分）。

### テスターに配る

1. TestFlight →「内部テスト」→ グループを作成 → 自分やスタッフを追加
2. 内部テストは**審査なしで即配布**されます
3. 外部テスター（店舗のお客様など）に配る場合は Beta App Review が必要（1〜2日）

---

## 3. 署名なしでビルドだけ確認する

シークレットを入れる前でも、コンパイルが通るかは確認できます。

```bash
gh workflow run ios-verify.yml
```

`ios/**` `web/**` `src/**` を変更してpushしたときにも自動で走ります。

---

## 4. 更新のたびにやること

Web側（`web/` や `src/`）を直したら、**そのまま配信するだけ**です。

```bash
git add . && git commit -m "ルール追加" && git push
gh workflow run ios-testflight.yml -f version=1.0.1
```

ビルド番号は自動で上がるため、バージョン重複エラーは起きません。

---

## 5. 審査に出すとき（**要専門家確認**）

内部テストのうちは審査不要ですが、外部テスト・App Store公開では審査があります。

| 項目 | 本アプリの状態 |
| --- | --- |
| 年齢レーティング | **17+** で申請（「シミュレーテッドギャンブル：頻繁／極度」を想定） |
| 賭博性 | 現金・賭け金・換金ポイントを**一切実装していない**。BPはゲーム内専用・非換金 |
| 実店舗への誘導 | 店舗情報の提示のみ。レート表記なし |
| 暗号化 | `ITSAppUsesNonExemptEncryption = false` を設定済み |
| プライバシー | 個人情報を収集しない構成（データはすべて端末内）。プライバシーポリシーのURLは要用意 |
| デモアカウント | 不要（ログインなし） |
| 審査メモの記載例 | 「本アプリは麻雀のルールを学ぶための一人用アプリです。現金・賞品との交換、賭け金の設定、他ユーザーとの金銭のやり取りは一切ありません。ポイントはゲーム内専用で換金できません。」 |

> App Storeガイドラインは変更されます。申請前に最新のガイドラインと、
> 必要に応じて弁護士等の専門家にご確認ください（**要専門家確認**）。

---

## 6. つまずいたときは

| 症状 | 原因と対処 |
| --- | --- |
| 画面が真っ白 | `ios/www` が空。`node scripts/build-ios-www.js` を実行してから再ビルド |
| `Not Found: web/index.html` と出る | `project.yml` の `www` が `type: folder` になっているか確認（フォルダ参照でないと構造が潰れます） |
| 署名で失敗する | バンドルIDが Identifiers に登録済みか、APIキーの権限が App Manager か確認 |
| `No profiles found` | `fetch-signing-files` に `--create` が付いているか確認 |
| アップロードで重複エラー | 同じビルド番号を使っている。ワークフローを再実行すれば `run_number` が進みます |
| 縦向きになる | `Info.plist` の `UISupportedInterfaceOrientations` と `AppDelegate` の両方で横持ち固定済み。実機の画面回転ロックを確認 |
| 実機で表示を調べたい | Macがあれば Safari →「開発」メニューから Web Inspector で覗けます（`isInspectable = true` 設定済み） |
