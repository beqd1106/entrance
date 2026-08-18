# App Store 用スクリーンショット

## 構成

```
raw-*.png                元画像（956 × 440 = 6.9インチ横向きの論理解像度）
appstore/6.9inch/*.png   2868 × 1320（必須）
appstore/6.5inch/*.png   2688 × 1242（必須）
```

## 作り直す手順

1. `start.bat` でサーバを起動
2. ブラウザのウィンドウを **956 × 440** にして、次の4画面を撮る
   - `#/play?preset=store_goto_kan`（対局中）
   - `#/store/goto_kan`（ハウスルールの差分表示までスクロール）
   - `#/store/goto_kan`（この店の特別な牌までスクロール）
   - `#/editor?preset=store_tokushu_kan`（特殊牌の編集欄までスクロール）
3. `store-assets/raw-01〜04.png` として保存
4. 合成スクリプトを実行（キャプション付き・両サイズ生成）

```bash
python scripts/make-appstore-shots.py
```

## より高精細にしたい場合

Xcodeのシミュレータ（iPhone 16 Pro Max・横向き）でアプリを起動し、`⌘S` で撮ると等倍で取得できます。
その場合はキャプションだけ後から合成してください。
