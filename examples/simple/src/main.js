import firebase from "firebase";
import { config } from "./config";

import * as Falcor from "falcor";
import { createDatasource} from "falcor-firebase";

export default async function main() {
  // 0-a. Firebase Databaseの初期化
  firebase.initializeApp(config);
  const database = firebase.database();

  // 0-b. Firebase DatabaseからFalcorのModelを作成する(実体はFalcor Router)
  const defs = [
    {name: "users", oneToMany: ["blogs", "comments"]},
    {name: "blogs", manyToOne: {author: {to: "users", indexes: ["title"]}}, oneToMany: ["comments"]},
    {name: "comments", manyToOne: {blog: {to :"blogs"}, commentedBy: {to: "users"}}},
  ];
  const model = new Falcor.Model({ source: createDatasource(database, defs, { verbose: true }) });

  let jsonEnvelope;
  jsonEnvelope = model.get(
    "users.orderBy.name.equalTo.Yosuke.length"
    // "blogs.orderBy.createdAt[0...3].title",
    // "blogs.orderBy.createdAt[0...3].author.name",
    // "blogs.orderBy.createdAt[0...3].comments.orderBy.createdAt.length"
    // "blogs[0...3].comments[0...2].message"
    // "users.orderBy.name.equalTo.Quramy[0].blogs.orderBy.title.equalTo.falcor[0].body"
  ).subscribe(s => {
    console.log(JSON.stringify(s, null, 2));
  } , err => {
    console.error(err);
  });

  database.ref('/users').orderByChild("name").equalTo("Yosuke").once("value").then(s => {
  //database.ref('/blogs').orderByKey().limitToFirst(2).once("value").then(s => {
    console.log(s.numChildren());
  });

  // "blogs.byId[{id}].[{props}]",
  // "blogs.length",
  // "blogs[0...10]",
  // "blogs.orderBy.createdAt.length",
  // "blogs.orderBy.createdAt[0...10]",
  // "blogs.orderBy.createdAt.startAt.abc.length",
  // "blogs.orderBy.createdAt.startAt.abc[0...10]",
  // "blogs.orderBy.createdAt.endAt.abc.length",
  // "blogs.orderBy.createdAt.endAt.abc[0...10]",
  // "blogs.orderBy.createdAt.equalTo.abc.length",
  // "blogs.orderBy.createdAt.equalTo.abc[0...10]",
  // model.get("blogs.orderBy.createdAtRev[0..1]['title', 'id']").subscribe(s => console.log(JSON.stringify(s, null, 2)));
}

export async function main2() {

  // 0-a. Firebase Databaseの初期化
  firebase.initializeApp(config);
  const database = firebase.database();

  // 0-b. Firebase DatabaseからFalcorのModelを作成する(実体はFalcor Router)
  const defs = [
    {name: "users", oneToMany: ["blogs", "comments"]},
    {name: "blogs", manyToOne: {author: {to: "users", indexes: ["title"]}}},
    {name: "comments", manyToOne: {blog: {to :"blogs"}, commentedBy: {to: "users"}}},
  ];
  const model = new Falcor.Model({ source: createDatasource(database, defs) }).batch();
  model.derefp = async function() {
    return new Promise((resolve, reject) => {
      model.deref.apply(model, arguments).subscribe(m =>{
        resolve(m);
      });
    });
  };

  let jsonEnvelope;

  // 1. ユーザーの作成
  jsonEnvelope = await model.call("users.push", [{name: "Quramy"}], ["id"]);
  const createdUser = jsonEnvelope.json.users.lastCreated;
  const createdUserModel = await model.derefp("users.lastCreated", "id");

  // 2. 投稿の作成
  jsonEnvelope = await model.call(
    "blogs.push",
    [
      {
        title: "falcor",
        body: "It's a data fetching library powered by Netflix",
        starred: 0,
        //author: {$type: "ref", value: ["users", "byId", createdUser.id]}  // JSON Graph形式で参照を保存
      }, {
        author: createdUser,
      }
    ],
    ["id"]
  );

  jsonEnvelope = await model.call(
    "blogs.push",
    [
      {
        title: "firebase",
        body: "It's a integrated platform for mobile development by Google",
        starred: 0,
        //author: {$type: "ref", value: ["users", "byId", createdUser.id]}  // JSON Graph形式で参照を保存
      }, {
        author: createdUser,
      }
    ],
    ["id"]
  );

  jsonEnvelope = await model.call(
    "blogs.push",
    [
      {
        title: "falcor and firebase",
        body: "It's awesome",
        starred: 0,
        //author: {$type: "ref", value: ["users", "byId", createdUser.id]}  // JSON Graph形式で参照を保存
      }, {
        author: createdUser,
      }
    ],
    ["id"]
  );
  const createdPost = jsonEnvelope.json.blogs.lastCreated;

  // 3. 作成した投稿の更新
  jsonEnvelope = await model.set({path: ["blogs", "byId", jsonEnvelope.json.blogs.lastCreated.id, "starred"], value: 10});

  // 4. 投稿の確認
  jsonEnvelope = await model.get(
    "blogs.lastCreated.title",
    "blogs.lastCreated.body",
    "blogs.lastCreated.starred",
    "blogs.lastCreated.author.id",
    "blogs.lastCreated.author.name"
  );
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));
  // console.log(JSON.stringify(model.getCache(), null ,2));
  // 下記のようなJSONが取得できる.
  // {
  //   "blogs": {
  //     "lastCreated": {
  //       "title": "falcor and firebase",
  //       "body": "It's awesome",
  //       "starred": 10,
  //       "author": {
  //         "id": "-KLwWPjOuMAE9SJKr41m",
  //         "name": "Quramy"
  //       }
  //     }
  //   }
  // }
  
  // 5-1. userからblogの参照
  jsonEnvelope = await model.get(
    "users.lastCreated['id', 'name']",
    "users.lastCreated.blogs.orderBy.createdAt[0]['title', 'body']"
  )
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));
  
  // 5-2. userからblogの参照
  jsonEnvelope = await model.get(
    "users.lastCreated['id', 'name']",
    "users.lastCreated.blogs.orderBy.createdAt[1]['title', 'body']"
  )
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));
  
  // 5-3. userからblogの参照
  jsonEnvelope = await model.get(
    "users.lastCreated['id', 'name']",
    "users.lastCreated.blogs.orderBy.createdAt[2]['id', 'title', 'body']"
  )
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));

  const targetBlog = jsonEnvelope.json.users.lastCreated.blogs.orderBy.createdAt[2];

  jsonEnvelope = await model.call(
    "users.push",
    [ { name: "Yosuke" } ],
    ["id"]
  );

  const otherUser = jsonEnvelope.json.users.lastCreated;

  jsonEnvelope = await model.call(
    "comments.push",
    [
      {
        message: "I like it"
      }, {
        blog: targetBlog,
        commentedBy: otherUser,
      }
    ],
    ["id"]
  );
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));

  jsonEnvelope = await model.get(
    `users.byId["${createdUser.id}"].name`
    //`users.byId[${createdUser.id}].blogs.orderBy.createdAt[0..10].comments.orderBy.createdAt[0].message`
  );
  jsonEnvelope = await createdUserModel.get(
    "name",
    "blogs.orderBy.createdAt[0...5].title",
    "blogs.orderBy.createdAt[0...5].comments.orderBy.createdAt[0...3].message"
  );
  console.log(JSON.stringify(jsonEnvelope.json, null, 2));

  process.exit(0);
}
