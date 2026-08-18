"""
make-appstore-shots.py - App Store用スクリーンショットを合成する

store-assets/raw-01〜04.png（956 x 440 で撮影したもの）から、
キャプション付きの 6.9インチ / 6.5インチ 用画像を生成する。

使い方: python scripts/make-appstore-shots.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC = 'store-assets'
OUT = 'store-assets/appstore'
SIZES = {'6.9inch': (2868, 1320), '6.5inch': (2688, 1242)}
CAPTIONS = [
    ('raw-01-play.png',   'その店のルールで、行く前に打てる'),
    ('raw-02-diff.png',   '違うのは、この19項目だけ'),
    ('raw-03-tiles.png',  '白ポッチも、アリスも、華牌も'),
    ('raw-04-editor.png', 'お店が、自分でルールを作れる'),
]


def font(size):
    for p in [r'C:\Windows\Fonts\YuGothB.ttc', r'C:\Windows\Fonts\meiryob.ttc']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def build():
    for label, (W, H) in SIZES.items():
        d_out = os.path.join(OUT, label)
        os.makedirs(d_out, exist_ok=True)
        for i, (name, caption) in enumerate(CAPTIONS, 1):
            src = os.path.join(SRC, name)
            if not os.path.exists(src):
                print('skip', src)
                continue
            shot = Image.open(src).convert('RGB')
            canvas = Image.new('RGB', (W, H), (10, 47, 40))
            dr = ImageDraw.Draw(canvas)
            for y in range(H):
                t = y / H
                dr.line([(0, y), (W, y)],
                        fill=(int(22 - 12 * t), int(112 - 65 * t), int(94 - 54 * t)))
            cap_h = int(H * 0.16)
            dr.text((W // 2, cap_h // 2), caption,
                    font=font(int(cap_h * 0.42)), fill=(255, 255, 255), anchor='mm')

            inner_w = int(W * 0.90)
            inner_h = int(inner_w * shot.height / shot.width)
            max_h = H - cap_h - int(H * 0.06)
            if inner_h > max_h:
                inner_h = max_h
                inner_w = int(inner_h * shot.width / shot.height)
            shot_r = shot.resize((inner_w, inner_h), Image.LANCZOS) \
                         .filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=3))
            x = (W - inner_w) // 2
            y = cap_h + (H - cap_h - inner_h) // 2

            shadow = Image.new('RGBA', (inner_w + 60, inner_h + 60), (0, 0, 0, 0))
            ImageDraw.Draw(shadow).rounded_rectangle(
                [30, 34, inner_w + 30, inner_h + 34], radius=28, fill=(0, 0, 0, 120))
            shadow = shadow.filter(ImageFilter.GaussianBlur(18))
            canvas.paste(shadow, (x - 30, y - 30), shadow)

            mask = Image.new('L', (inner_w, inner_h), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner_w, inner_h], radius=24, fill=255)
            canvas.paste(shot_r, (x, y), mask)
            canvas.save(os.path.join(d_out, f'{i:02d}.png'))
        print(label, 'ok')


if __name__ == '__main__':
    build()
