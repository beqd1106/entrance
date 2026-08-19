/**
 * manual.js - アプリ内の使い方ガイド
 *
 * 内容はここ1か所にまとめる（Web版とiPhone版で同じものが出る）。
 * 別ファイルの説明書を作ると、片方だけ古くなって必ずずれる。
 *
 * 書き方の方針
 *   - 麻雀は分かるが、このアプリは初めて、という人を想定する
 *   - 画面名ではなく「やりたいこと」から引けるようにする
 *   - 分からなくても困らないことは書かない（読む量を増やさない）
 */
import { h, clear, icon, sectionHead, tileEl, photoImg } from './ui.js';
import { hasServer } from './api.js';

/** 牌を文中に置くための小さな部品 */
const tile = (info) => tileEl(info, { size: 'sm' });

const SECTIONS = [
  {
    id: 'about',
    num: '01',
    title: 'Houserule とは',
    lead: '雀荘ごとに違う「ハウスルール」を、行く前に試せるサービスです。',
    blocks: [
      { type: 'text', body:
        'はじめての店に入るとき、いちばん不安なのは「この店のルールを知らないこと」です。'
        + '赤牌の枚数、白ポッチ、アリス、抜きドラ。店によって違うのに、'
        + '入ってみないと分かりません。' },
      { type: 'text', body:
        'Houserule は、その店のハウスルールをそのまま読み込んでCPUと対局できます。'
        + '知らないルールを、誰にも見られない場所で先に試せます。' },
      { type: 'callout', tone: 'brass', title: 'ポイントについて', body:
        'アプリの中で増減する BP（ゲーム内ポイント）は非換金です。'
        + '現金・景品とは交換できません。賭博性のある設計は含みません。' },
    ],
  },
  {
    id: 'find',
    num: '02',
    title: '店をさがす',
    lead: '地域や料金ではなく、ルールで探せます。',
    blocks: [
      { type: 'steps', items: [
        { t: '「店舗をさがす」を開く', b: '上のメニューから移動します。' },
        { t: '条件のタグを押す', b: '「白ポッチ」「アリス」「三麻」など、気になるルールを押すと絞り込まれます。もう一度押すと外れます。' },
        { t: 'カードを見る', b: 'カードの右下に、その店の特徴的な牌が並びます。何が入っている店かが一目で分かります。' },
      ] },
      { type: 'tiles', label: 'カードに出る牌の例', items: [
        { info: { t: 31, dot: true, name: '白ポッチ' }, label: '白ポッチ' },
        { info: { t: 22, blue: true, name: '青5索' }, label: '青5索' },
        { info: { t: 13, red: true, name: '赤5筒' }, label: '赤5筒' },
        { info: { t: 34, flower: 'spring', name: '春' }, label: '華牌' },
        { info: { t: 30, name: '北' }, label: '抜きドラ' },
      ] },
    ],
  },
  {
    id: 'rules',
    num: '03',
    title: 'ルールを読む',
    lead: 'ルール表を最初から読む必要はありません。',
    blocks: [
      { type: 'text', body:
        '店舗ページの「ハウスルール」には3つの見方があります。'
        + '迷ったら いちばん左の「初心者向け」だけ読めば足ります。' },
      { type: 'table', head: ['見方', '中身', 'こんなとき'], rows: [
        ['初心者向け', 'この店の特別なルールを、ふつうの文章で説明します。牌の絵つき。', 'はじめてこの店を見るとき'],
        ['一般ルールとの差分', 'よくある四麻・三麻と違うところ「だけ」を並べます。', '普通のルールは分かっているとき'],
        ['ルール全文', '設定されている項目をすべて出します。', '細かく確認したいとき'],
      ] },
      { type: 'callout', tone: 'sky', title: '覚えることは最小限で足ります', body:
        '差分は多くても十数項目です。全部を覚えなくても、次の「打ってみる」で体に入ります。' },
    ],
  },
  {
    id: 'play',
    num: '04',
    title: '打ってみる',
    lead: '操作は「牌を2回タップ」だけ覚えれば打てます。',
    blocks: [
      { type: 'steps', items: [
        { t: '切る牌を1回タップ', b: '選んだ牌が浮き上がります。まだ切られていません。' },
        { t: 'もう一度タップして確定', b: '2回押しで確定するので、誤タップで意図しない牌を切ることがありません。' },
        { t: 'ポン・チー・カン・リーチ', b: 'できるときだけ、手牌の上にボタンが出ます。出ていないときはできません。' },
      ] },
      { type: 'table', head: ['やりたいこと', '操作'], rows: [
        ['牌の意味を知りたい', '牌を長押しすると、その牌が何なのか（白ポッチ・特殊牌・ドラかどうか）が出ます'],
        ['あと何が来ればアガリか', 'テンパイすると、手牌の下に待ち牌と「残り何枚あるか」が出ます'],
        ['この牌を切るとどうなるか', '牌を1回タップした状態だと、その牌を切ったときの待ちが先に出ます'],
        ['進み具合を知りたい', '手牌の下の「◯向聴」が、あと何回入れ替えればテンパイかの目安です'],
        ['速さを変えたい', '画面上の「ゆっくり／標準／速い」でCPUの打つ速さが変わります'],
        ['やめたい', '左上の「← 店舗一覧」でいつでも抜けられます'],
      ] },
      { type: 'callout', tone: 'teal', title: 'スマホは横向きがおすすめ', body:
        '横向きにすると、手牌・河・点数が1画面に収まります。縦のままでも打てます。' },
    ],
  },
  {
    id: 'special',
    num: '05',
    title: '特別な牌とルール',
    lead: 'よく出てくるものだけ、先に知っておくと戸惑いません。',
    blocks: [
      { type: 'defs', items: [
        { info: { t: 31, dot: true, name: '白ポッチ' }, term: '白ポッチ',
          body: '白の牌のうち1枚に赤い点が付いたもの。店の設定によって、リーチ後のツモで引くと好きな牌の代わりに使えます。ふつうの白としても使えます。' },
        { info: { t: 34, flower: 'spring', name: '春' }, term: '華牌（春夏秋冬）',
          body: '引くと自動で手牌から抜けて、すぐ次の牌を引きます。春夏秋冬それぞれ効果が違い、打点が上がったりボーナスがもらえたりします。' },
        { info: { t: 30, name: '北' }, term: '抜きドラ',
          body: '三人麻雀で使います。北などを手牌から抜いて自分の前に置くと、ドラが増えて打点が上がります。抜いたあとはすぐ次の牌を引けます。' },
        { info: { t: 22, blue: true, name: '青5索' }, term: '特殊牌',
          body: '店が独自に決めた色つきの牌です。持っているとドラが増える・打点が上がる・ボーナスがもらえるなど、店ごとに効果が違います。店舗ページで確認できます。' },
      ] },
      { type: 'table', head: ['名前', '何が起きるか'], rows: [
        ['アリス', 'アガったあと山の牌をめくり、自分の手にあった牌と同じものが出るとボーナス。当たる限りめくり続けられます'],
        ['チューリップ', 'アリスと似ていますが、めくった牌の1つ隣までが当たり扱いになります'],
        ['割れ目', 'サイコロで決まった人は、払うときも受け取るときも点数が倍になります'],
        ['オープンリーチ', '手牌を見せてリーチする代わりに、アガったときの点数が上がります'],
        ['サイコロチャンス', '役満などの条件を満たすとサイコロを振れて、出た目のぶんボーナスがもらえます'],
      ] },
    ],
  },
  {
    id: 'store',
    num: '06',
    title: '店舗の方へ',
    lead: 'プログラミングの知識は要りません。設定を変えると、説明文もCPUの挙動も同時に変わります。',
    audience: 'store',
    blocks: [
      { type: 'steps', items: [
        { t: '店舗情報を入れる', b: '「店舗管理」→「店舗情報を編集する」。店名・住所・営業時間・料金・雰囲気を埋めます。右側に、お客様から見えるカードが常に出ます。' },
        { t: 'ハウスルールを設定する', b: '「ルール編集」。上部の目次から直したい項目へ飛べます。ベースのルールを選んでから、違うところだけ直すのが早いです。' },
        { t: '自分で試し打ちする', b: '「このルールで試し打ちする」。設定どおりに動くか、公開前に必ず一度確かめてください。' },
        { t: '公開前チェックを埋める', b: '「店舗管理」に、足りない項目だけが大きく出ます。全部埋まると公開できます。' },
      ] },
      { type: 'table', head: ['画面', 'できること'], rows: [
        ['店舗管理', '公開までの進み具合・体験プレイ数・来店数・ルールの違いの数'],
        ['店舗情報を編集', '店名や料金、店舗写真の差し替え、スタッフ紹介'],
        ['ルール編集', 'ハウスルールの設定。設定チェックで、成立しない組み合わせを知らせます'],
      ] },
      { type: 'callout', tone: 'amber', title: '編集キーについて', body:
        '店舗の内容を書き換えられるのは、編集キーを持っている端末だけです。'
        + '運営から受け取ったキーを「店舗情報を編集」の右側に一度貼れば、以後その端末で編集できます。'
        + 'キーは他の人に渡さないでください。' },
    ],
  },
  {
    id: 'faq',
    num: '07',
    title: 'よくある質問',
    lead: '',
    blocks: [
      { type: 'faq', items: [
        { q: 'ポイントは換金できますか', a: 'できません。BP はアプリの中だけのもので、現金にも景品にも交換できません。順位や記録を見るためだけに使います。' },
        { q: '通信がなくても使えますか', a: '使えます。対局・ルール編集・店舗ページはすべて手元で動きます。サーバに繋がっているときだけ、店舗情報の共有と集計が加わります。' },
        { q: '入力した内容はどこに残りますか', a: '保存を押すまでは、その端末の中だけです。保存すると、店舗情報はサーバにも保管され、他の端末からも見えるようになります。' },
        { q: '実在の雀荘のルールですか', a: 'いいえ。収録しているのは架空のデモ店舗です。実在店舗のハウスルールは転載していません。' },
        { q: 'アプリを閉じたら対局は消えますか', a: '対局中の内容は保存されません。半荘の途中で閉じると、次に開いたときは最初からになります。' },
        { q: '文章からルールを作る機能が使えません', a: 'この機能はサーバ側の準備が要ります。使えないときは画面に理由が出ます。設定を1つずつ選ぶ通常の編集は、いつでも使えます。' },
      ] },
    ],
  },
];

// ---------------------------------------------------------------------------
export function renderManual(root) {
  clear(root);
  const sec = h('section.section', h('div.wrap'));
  const wrap = sec.firstChild;

  wrap.appendChild(h('div', { style: { marginBottom: '10px' } },
    h('div.eyebrow', { text: 'MANUAL' }),
    h('h1', { style: { fontSize: 'clamp(24px,3.4vw,34px)', marginTop: '6px' }, text: '使い方' }),
    h('p.muted', { style: { margin: '8px 0 0', maxWidth: '62ch' },
      text: 'この画面だけ読めば、お客様としても店舗としても一通り使えます。' })));

  // 目次（長いので、読みたいところへ飛べるようにする）
  const jump = h('div.editor-jump', { style: { marginBottom: '22px' } });
  for (const s of SECTIONS) {
    const b = h('button.jump-chip', { text: s.title });
    b.addEventListener('click', () => {
      document.getElementById(`man-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    jump.appendChild(b);
  }
  wrap.appendChild(jump);

  for (const s of SECTIONS) {
    const box = h('div.manual-sec', { id: `man-${s.id}` });
    box.appendChild(sectionHead(s.num, s.title, s.lead));
    if (s.audience === 'store') {
      box.appendChild(h('div.manual-badge', { text: '店舗向け' }));
    }
    for (const b of s.blocks) box.appendChild(block(b));
    wrap.appendChild(box);
    wrap.appendChild(h('div.rule-line'));
  }

  // いまの接続状態。書いてあることと目の前の画面が食い違わないようにする。
  wrap.appendChild(h('div.notice', { style: { marginTop: '4px' },
    text: hasServer()
      ? 'この端末はサーバに接続しています。店舗情報の共有と、体験プレイ数の集計が有効です。'
      : 'この端末はサーバに接続していません。すべての機能が手元だけで動き、記録もこの端末に残ります。' }));

  root.appendChild(sec);
  return () => {};
}

// ---------------------------------------------------------------------------
function block(b) {
  if (b.type === 'text') {
    return h('p.manual-text', { text: b.body });
  }

  if (b.type === 'callout') {
    return h(`div.manual-callout.tone-${b.tone || 'slate'}`,
      h('div.manual-callout-title', { text: b.title }),
      h('p', { text: b.body }));
  }

  if (b.type === 'steps') {
    const list = h('ol.manual-steps');
    for (const it of b.items) {
      list.appendChild(h('li',
        h('div.manual-step-t', { text: it.t }),
        h('div.manual-step-b', { text: it.b })));
    }
    return list;
  }

  if (b.type === 'table') {
    return h('div.manual-table-wrap',
      h('table.manual-table',
        h('thead', h('tr', b.head.map((x) => h('th', { text: x })))),
        h('tbody', b.rows.map((r) => h('tr', r.map((c, i) =>
          (i === 0 ? h('th', { text: c }) : h('td', { text: c }))))))));
  }

  if (b.type === 'tiles') {
    return h('div.manual-tiles',
      h('div.label', { text: b.label }),
      h('div.manual-tile-row', b.items.map((it) => h('div.manual-tile',
        tile(it.info),
        h('span', { text: it.label })))));
  }

  if (b.type === 'defs') {
    const list = h('div.manual-defs');
    for (const it of b.items) {
      list.appendChild(h('div.manual-def',
        h('div.manual-def-face', tileEl(it.info, { size: 'lg' })),
        h('div.grow',
          h('div.manual-def-term', { text: it.term }),
          h('p', { text: it.body }))));
    }
    return list;
  }

  if (b.type === 'faq') {
    const list = h('div.manual-faq');
    for (const it of b.items) {
      list.appendChild(h('details.manual-q',
        h('summary', { text: it.q }),
        h('p', { text: it.a })));
    }
    return list;
  }

  return h('div');
}
