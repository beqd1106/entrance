/**
 * config.js - 接続先の設定
 *
 * ここを空文字にすると、アプリは完全に端末内だけで動く（サーバ不要）。
 * デモを配るとき・ネットワークの無い場所で見せるときは空にしてよい。
 */
window.HOUSERULE_API = 'https://mi24euwej5.execute-api.ap-northeast-1.amazonaws.com';

// オンライン対局の中継。ここも空文字にすればオンライン対局だけが消える
// （他の画面は今までどおり動く）。
window.HOUSERULE_WS = 'wss://15hkem0z4i.execute-api.ap-northeast-1.amazonaws.com/prod';
