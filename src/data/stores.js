/**
 * stores.js - デモ用の架空雀荘データ
 *
 * 注意：実在店舗のハウスルールをそのまま転載していない。
 * 「よく見られるルール系統」を組み合わせた架空店舗として構成している。
 * すべてノーレート・ゲーム内非換金ポイントのみの前提。
 */

export const STORES = [
  {
    id: 'yonma_kan',
    // 店舗写真（生成素材。文字は入れていない）。サーバに写真が無いときはこれを使う
    photoFile: 'img/store-yonma_kan.webp',
    /**
     * お知らせ・イベント情報。
     * 掲載期間（startAt〜endAt）の内側だけ店舗ページに出る。
     * 対局のルールには影響しない、案内のためのもの。
     */
    notices: [
      {
        id: 'yk_ev1', kind: 'event',
        title: '毎週水曜は初心者卓の日',
        body: 'ルール説明つきの卓を立てます。打ち方が分からなくても大丈夫です。',
        // 画像1枚だけで配る告知の見本。縦向きのチラシがそのまま入る
        image: 'img/notices/beginner-day.jpg',
        startAt: '', endAt: '',
      },
      {
        id: 'yk_ev3', kind: 'event',
        title: '平日サービスDAY',
        body: '',
        image: 'img/notices/weekday-service.jpg',
        startAt: '', endAt: '',
      },
      {
        id: 'yk_ev2', kind: 'notice',
        title: '年末年始の営業について',
        body: '12/31は24時まで、1/1は休みです。1/2から通常どおり開けます。',
        startAt: '2026-12-01', endAt: '2027-01-03',
      },
    ],
    // 会員クーポン（店頭提示の案内。アプリ内で金銭のやり取りはしない）
    coupons: [
      { id: 'yk_first', title: '初回1時間無料', body: 'はじめての来店で、セット1時間ぶんが無料になります。', requires: {} },
      { id: 'yk_play3', title: 'フリー1半荘 100円引き', body: 'アプリでこの店のルールを3回体験した方へ。', requires: { plays: 3 } },
      { id: 'yk_visit3', title: 'ドリンク1杯サービス', body: '3回めの来店から。スタッフに会員番号をお伝えください。', requires: { checkins: 3 } },
    ],
    name: 'DEMO雀荘 四麻館',
    catch: 'はじめての1半荘を、いちばん安心して打てる店。',
    presetId: 'store_yonma_kan',
    area: '東京都・新宿',
    address: '（架空）東京都新宿区デモ1-2-3 デモビル4F',
    access: 'JR新宿駅 東口から徒歩5分',
    hours: '12:00〜翌5:00（年中無休）',
    smoking: '禁煙（喫煙ブースあり）',
    tables: '四人打ち 6卓',
    style: 'ノーレート',
    beginner: 5,
    beginnerNote: '講習卓あり。初回は必ずスタッフが同卓してルール説明します。',
    mood: ['落ち着いた', '初心者歓迎', '静か', '女性スタッフ在籍'],
    priceLines: [
      { label: 'セット（1卓1時間）', value: '2,400円' },
      { label: 'フリー1半荘', value: '400円' },
      { label: '学生割', value: '−100円/半荘' },
      { label: '初回来店', value: '1時間無料' },
    ],
    staff: [
      { name: 'マナベ', role: '店長', word: 'ルール説明は何回でも聞いてください。覚えるより慣れるほうが早いです。' },
      { name: 'サカイ', role: 'スタッフ', word: '打ち方に迷ったら手を止めてOK。急かす人はこの店にはいません。' },
    ],
    events: [
      { date: '毎週火曜', title: '初心者だけの日', body: '経験1年未満だけの卓。点数計算はスタッフが読み上げます。' },
      { date: '毎月第1土曜', title: 'アリス祭', body: 'アリスの成立数を競うイベント（賞品はゲーム内バッジのみ）。' },
    ],
    sns: { x: '@demo_yonmakan', web: 'https://example.invalid/yonmakan' },
    photo: { hue: 168, icon: 'table' },
    ruleHighlights: ['赤3枚', '白ポッチ1枚', 'アリスあり', '青5索', 'オープンリーチあり'],
    tags: ['四麻', '赤あり', '白ポッチ', 'アリス', 'オープンリーチ', '禁煙', 'ノーレート', '初心者歓迎', '東京'],
  },
  {
    id: 'tokushu_kan',
    // 店舗写真（生成素材。文字は入れていない）。サーバに写真が無いときはこれを使う
    photoFile: 'img/store-tokushu_kan.webp',
    coupons: [
      { id: 'tk_play2', title: '特殊牌の解説カード進呈', body: 'アプリで2回体験した方へ。卓上カードと同じものをお渡しします。', requires: { plays: 2 } },
      { id: 'tk_visit2', title: 'セット30分延長', body: '2回めの来店から使えます。', requires: { checkins: 2 } },
    ],
    name: 'DEMO雀荘 特殊牌館',
    catch: '牌に意味がある。1枚めくるたびに空気が変わる店。',
    presetId: 'store_tokushu_kan',
    area: '大阪府・難波',
    address: '（架空）大阪市中央区デモ5-6-7 デモ会館2F',
    access: '地下鉄なんば駅から徒歩3分',
    hours: '16:00〜翌6:00（火曜定休）',
    smoking: '分煙（喫煙可卓あり）',
    tables: '四人打ち 4卓',
    style: 'ノーレート',
    beginner: 3,
    beginnerNote: '特殊牌の一覧表を各卓に常設。ルールは覚えなくても卓上カードで確認できます。',
    mood: ['にぎやか', 'ゲーム性重視', '常連が多い', '深夜営業'],
    priceLines: [
      { label: 'セット（1卓1時間）', value: '2,000円' },
      { label: 'フリー1半荘', value: '350円' },
      { label: '深夜パック（0-5時）', value: '2,500円' },
    ],
    staff: [
      { name: 'クロダ', role: '店長', word: '特殊牌は覚えるものじゃなく、引いたら教えてもらうものです。' },
      { name: 'ハナオカ', role: 'スタッフ', word: '割れ目で人生が変わる瞬間、何度も見てきました。' },
    ],
    events: [
      { date: '毎週金曜', title: 'ジュエルナイト', body: '特殊牌の組み合わせ役（オールスター）成立でゲーム内称号を配布。' },
      { date: '毎月22日', title: 'アメジストデー', body: 'アメジスト5筒のBPが倍。リーチ後のオールマイティ和了を狙う日。' },
      { date: '毎月15日', title: '割れ目デー', body: '全卓で割れ目オン。振れ幅が大きいので初心者は非推奨です。' },
    ],
    sns: { x: '@demo_tokushu', web: 'https://example.invalid/tokushu' },
    photo: { hue: 268, icon: 'gem' },
    ruleHighlights: ['特殊牌6種', 'アメジスト5筒', '割れ目あり', 'オープンリーチ2翻', '白ポッチ', '数え役満11翻'],
    tags: ['四麻', '特殊牌', 'オールマイティ', '割れ目', 'オープンリーチ', '白ポッチ', '分煙', 'ノーレート', '大阪'],
  },
  {
    id: 'goto_kan',
    // 店舗写真（生成素材。文字は入れていない）。サーバに写真が無いときはこれを使う
    photoFile: 'img/store-goto_kan.webp',
    coupons: [
      { id: 'gk_play1', title: '五等サンマ講習を無料に', body: 'アプリで1回でも打ってから来ていただいた方へ。', requires: { plays: 1 } },
      { id: 'gk_visit5', title: 'フリー1半荘無料', body: '5回めの来店から。常連さんへのお礼です。', requires: { checkins: 5 } },
    ],
    name: 'DEMO雀荘 五等サンマ館',
    catch: '春夏秋冬を抜いて、点数以外の何かも動かす三人麻雀。',
    presetId: 'store_goto_kan',
    area: '愛知県・名古屋',
    address: '（架空）名古屋市中村区デモ8-9 デモプラザ3F',
    access: '名鉄名古屋駅から徒歩6分',
    hours: '14:00〜翌4:00（無休）',
    smoking: '喫煙可（分煙設備あり）',
    tables: '三人打ち 5卓',
    style: 'ノーレート',
    beginner: 2,
    beginnerNote: '三麻経験者向け。初来店の方はまずアプリでルール体験してからのご来店を推奨しています。',
    mood: ['熱い', '打点が高い', 'スピード感', '常連の会話が多い'],
    priceLines: [
      { label: 'セット（1卓1時間）', value: '1,800円' },
      { label: 'フリー1回戦', value: '300円' },
      { label: '早割（14-17時）', value: '−50円/回戦' },
    ],
    staff: [
      { name: 'ゴトウ', role: '店長', word: '華牌は運じゃなく、抜いたあとどう打つかの話です。' },
      { name: 'ミヤベ', role: 'スタッフ', word: '冬を抜いた瞬間の顔が全員違うのが面白い。' },
    ],
    events: [
      { date: '毎週水曜', title: '四華チャレンジ', body: '春夏秋冬を1局で4枚抜けたらゲーム内称号「四華」を付与。' },
      { date: '毎月末', title: '月間BPランキング', body: '非換金のゲーム内ポイント上位者を店内モニターに掲示。' },
    ],
    sns: { x: '@demo_gotokan', web: 'https://example.invalid/gotokan' },
    photo: { hue: 22, icon: 'flower' },
    ruleHighlights: ['35000/40000', '常時ドラ2枚', '北抜き', '春夏秋冬', '白ポッチ', '金5', 'サイコロチャンス', '冬アリス', '青5索'],
    tags: ['三麻', '五等サンマ', '華牌', '白ポッチ', '金牌', 'サイコロチャンス', 'アリス', '喫煙可', 'ノーレート', '愛知'],
  },
];

/** 検索フィルタの定義（UIはこの定義から自動生成される） */
export const FILTERS = [
  {
    key: 'players', label: '人数', options: [
      { value: '四麻', test: (s, r) => r.game.players === 4 },
      { value: '三麻', test: (s, r) => r.game.players === 3 },
    ],
  },
  {
    key: 'aka', label: '赤牌', options: [
      { value: '赤あり', test: (s, r) => Object.values(r.dora.red || {}).some((n) => n > 0) },
      { value: '赤なし', test: (s, r) => !Object.values(r.dora.red || {}).some((n) => n > 0) },
    ],
  },
  {
    key: 'special', label: '特殊ルール', options: [
      { value: '白ポッチ', test: (s, r) => r.local.shiroPocchi.enabled },
      { value: '金牌', test: (s, r) => Object.values(r.dora.gold || {}).some((n) => n > 0) },
      { value: 'アリス', test: (s, r) => r.local.alice.enabled || Object.values(r.flowers.effects || {}).some((l) => (l || []).some((e) => e.type === 'alice')) },
      { value: 'チューリップ', test: (s, r) => r.local.tulip.enabled },
      { value: 'オープンリーチ', test: (s, r) => r.local.openRiichi.enabled },
      { value: '割れ目', test: (s, r) => r.local.wareme.enabled },
      { value: '華牌', test: (s, r) => r.flowers.enabled },
      { value: 'サイコロチャンス', test: (s, r) => r.local.dice.enabled },
      { value: '特殊牌', test: (s, r) => (r.specialTiles || []).length > 0 },
      { value: 'オールマイティ牌', test: (s, r) => (r.specialTiles || []).some((d) => (d.effects || []).some((e) => e.type === 'almighty')) || (r.local.shiroPocchi.enabled && r.local.shiroPocchi.mode !== 'bonus') },
      { value: '爆ドラ', test: (s, r) => (r.dora.bakuDora || 0) > 0 },
      { value: 'ローカル役', test: (s, r) => (r.localYaku || []).some((y) => y.enabled !== false) },
      { value: '東天紅系', test: (s, r) => r.scoring.mode === 'flat' },
      { value: '五等サンマ系', test: (s, r) => r.game.players === 3 && r.flowers.enabled && r.dora.indicators >= 2 },
    ],
  },
  {
    key: 'env', label: '環境', options: [
      { value: '禁煙', test: (s) => /禁煙/.test(s.smoking) },
      { value: '喫煙可', test: (s) => /喫煙可/.test(s.smoking) },
      { value: 'ノーレート', test: (s) => s.style === 'ノーレート' },
      { value: '初心者歓迎', test: (s) => s.beginner >= 4 },
    ],
  },
  {
    key: 'area', label: '地域', options: [
      { value: '東京', test: (s) => /東京/.test(s.area) },
      { value: '大阪', test: (s) => /大阪/.test(s.area) },
      { value: '愛知', test: (s) => /愛知/.test(s.area) },
    ],
  },
];

export function getStore(id) {
  return STORES.find((s) => s.id === id) || STORES[0];
}

/**
 * 見つからなければ null を返す版。
 * getStore は見つからないと先頭の店を返すので、古いリンクや打ち間違いでも
 * 別の店がその店として出てしまい、見ている人は気づけない。
 * 「その店を出す」画面ではこちらを使う。
 */
export function findStore(id) {
  return STORES.find((s) => s.id === id) || null;
}
