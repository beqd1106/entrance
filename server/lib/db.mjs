/**
 * db.mjs - DynamoDB の薄いラッパ
 *
 * テーブルは1本（houserule-main）。キーの持ち方は次のとおり。
 *
 *   pk = STORE#<id>   sk = PROFILE   店舗プロフィール
 *   pk = STORE#<id>   sk = RULES     ハウスルール（rules パッチ）
 *   pk = STORE#<id>   sk = STATS     体験プレイ数・来店数などのカウンタ
 *   pk = STORES       sk = STORE#<id> 一覧用の軽い索引
 *   pk = GUARD#<key>  sk = <日付>     連打よけ（TTLで自動的に消える）
 *
 * 1テーブルに寄せているのは、テーブル数ぶんの管理コストを増やさないため。
 */
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const TABLE = process.env.TABLE_NAME || 'houserule-main';
const ddb = new DynamoDBClient({});

const M = (o) => marshall(o, { removeUndefinedValues: true });

export async function getItem(pk, sk) {
  const r = await ddb.send(new GetItemCommand({ TableName: TABLE, Key: M({ pk, sk }) }));
  return r.Item ? unmarshall(r.Item) : null;
}

export async function putItem(item) {
  await ddb.send(new PutItemCommand({ TableName: TABLE, Item: M(item) }));
  return item;
}

export async function queryPk(pk) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: '#p = :p',
    ExpressionAttributeNames: { '#p': 'pk' },
    ExpressionAttributeValues: M({ ':p': pk }),
  }));
  return (r.Items || []).map((i) => unmarshall(i));
}

/** カウンタを1つ増やす。競合しても数え漏れないよう ADD を使う。 */
export async function bump(pk, sk, field, by = 1) {
  const r = await ddb.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: M({ pk, sk }),
    UpdateExpression: 'ADD #f :n SET updatedAt = :t',
    ExpressionAttributeNames: { '#f': field },
    ExpressionAttributeValues: M({ ':n': by, ':t': new Date().toISOString() }),
    ReturnValues: 'ALL_NEW',
  }));
  return r.Attributes ? unmarshall(r.Attributes) : null;
}

/**
 * サービス全体の1日あたりの上限。
 *
 * 相手ごとの制限（underDailyLimit）は、IPを変えられると効かない。
 * 費用が青天井にならないことを保証するのはこちらの役目で、
 * 「1日にこれ以上は絶対にやらない」という硬い天井をここで作る。
 */
export async function underGlobalDailyLimit(name, limit) {
  return underDailyLimit(`ALL:${name}`, limit);
}

/**
 * 同じ相手からの連打を弾く。
 * 統計を水増しされると店舗が判断を誤るので、1日あたりの上限を設ける。
 * 記録自体は TTL で自動的に消えるので、掃除の手間もコストもかからない。
 */
export async function underDailyLimit(key, limit = 50) {
  const day = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 26;
  try {
    const r = await ddb.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: M({ pk: `GUARD#${key}`, sk: day }),
      UpdateExpression: 'ADD n :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
      ExpressionAttributeValues: M({ ':one': 1, ':ttl': ttl }),
      ReturnValues: 'ALL_NEW',
    }));
    const n = r.Attributes ? Number(unmarshall(r.Attributes).n || 0) : 0;
    return n <= limit;
  } catch {
    // 数えられなくても本来の処理は止めない
    return true;
  }
}
