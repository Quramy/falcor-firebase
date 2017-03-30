# Falcor Firebase

[![Greenkeeper badge](https://badges.greenkeeper.io/Quramy/falcor-firebase.svg)](https://greenkeeper.io/)
This provides a Falcor data source from your Firebase realtime database.

## Install
*T.B.D.*

## Getting started

```javascript
import firebase from "firebase";
import * as Falcor from "falcor";
import { createDatasource } from "falcor-firebase";

function async main() {
  const config = {/* your firebase configuration */};
  firebase.initializeApp(config);
  const database = firebase.database();
  const model = new Falcor.model({
    source: createDatasource(database, [
      {name: "todos"},
    ]);
  });

  let jsonEnvelope;

  // All collections have ".push" call path. It creates a new item into the collection.
  jsonEnvelope = await model.call("todos.push", [{text: "Buy the milk", done: false}], ["id"]);

  // .push returns ".lastCreated" reference. It's useful to get an ID field of the created item.
  const id = jsonEnvelope.json.todos.lastCreated.id;

  // ".byId" allows ID access.
  jsonEnvelope = await model.get(`todos.byId['${id}'].text`);
  jsonEnvelope = await model.set({path: `byId['${id}'.done`, value: true});
  const done = await model.getValue(`todos.byId['${id}'].done`);
  console.log(done);
}

main();
```

## License
This software is released under the MIT License, see LICENSE.txt.

