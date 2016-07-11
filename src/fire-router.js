import _ from "lodash";
import Router from "falcor-router";

class OnetimeCache {
  constructor() {
    this._cache = {};
  }
  has(collectionName, id) {
    if (!this._cache[collectionName]) return false;
    return !!this._cache[collectionName][id];
  }
  put(collectionName, nodes) {
    this._cache[collectionName] = nodes;
  }
  get(collectionName, id) {
    if (this._cache[collectionName]) {
      return this._cache[collectionName][id];
    } else {
      return null;
    }
  }
  pop(collectionName, id) {
    if (this._cache[collectionName]) {
      delete this._cache[collectionName][id];
    }
  }
}

function createRoutingDefinitions(defs) {
  const oneToManyIndexes = {};
  defs.forEach(def => {
    if (def.oneToMany && def.oneToMany.length) {
      def.oneToMany.forEach(otm => {
        if (!oneToManyIndexes[otm]) oneToManyIndexes[otm] = [];
        oneToManyIndexes[otm].push(def.name);
      });
    }
  });
  //console.log(defs, oneToManyIndexes);
  const routingsByCollections = defs.map(def => {
    const collectionName = def.name;
    const oneToMany = def.oneToMany || [];
    return [
      ..._.flatten(oneToMany.map(refName => {
        return _.flatten([
          {pathFagments: "", getProp: (pathset) => "createdAtRev", refFragments: (pathset) => []},
          {pathFagments: ".orderBy[{keys:props}]", getProp: (pathset) => pathset.props[0], refFragments: (pathset) => ["orderBy", pathset.props[0]]},
          {pathFagments: ".orderBy[{keys:props}].equalTo[{keys:searches}]", getProp: (pathset) => pathset.props[0], subQuery: (pathset) => (q) => q.equalTo(pathset.searches[0]), refFragments: (pathset) => ["orderBy", pathset.props[0], "equalTo", pathset.searches[0]]},
        ].map(queryPattern => {
          return [{
            route: `${collectionName}.byId[{keys:ids}].${refName}${queryPattern.pathFagments}[{integers:indexes}]`,
            get: function(pathset) {
              this.logPathset(pathset);
              const prop = queryPattern.getProp(pathset);
              const subQuery = queryPattern.subQuery ? queryPattern.subQuery(pathset) : q => q;
              const paths = pathset.ids.map(id => ({ refPath: `/${collectionName}/${id}/${refName}`, fPath: [collectionName, "byId", id, refName], id}));
              return Promise.all(paths.map(p => {
                return this.query({collectionName: p.refPath, prop, indexes: pathset.indexes, subQuery})
                .then(results => results.map(({index, node}) => this.ref(
                  [...p.fPath, ...queryPattern.refFragments(pathset), index],
                  node._refValue.split(".")
                )));
              })).then(result => {
                this.log("[RESULT]", JSON.stringify(_.flatten(result)));
                return _.flatten(result);
              });
            }
          }, {
            route: `${collectionName}.byId[{keys:ids}].${refName}${queryPattern.pathFagments}.length`,
            get: function(pathset) {
              this.logPathset(pathset);
              const prop = queryPattern.getProp(pathset);
              const subQuery = queryPattern.subQuery ? queryPattern.subQuery(pathset) : q => q;
              const paths = pathset.ids.map(id => ({ refPath: `/${collectionName}/${id}/${refName}`, fPath: [collectionName, "byId", id, refName], id}));
              return Promise.all(paths.map(p => {
                return subQuery(this._db.ref(p.refPath)).once("value").then(snapshot => {
                  const count = snapshot.numChildren();
                  return {
                    path: [...p.fPath, ...queryPattern.refFragments(pathset), "length"],
                    value: count
                  };
                });
              })).then(result => {
                this.log("[RESULT]", JSON.stringify(_.flatten(result)));
                return _.flatten(result);
              });
            }
          }];
        }));
      })),
      ..._.flatten([
        {pathFagments: "", getProp: (pathset) => "createdAtRev", refFragments: (pathset) => []},
        {pathFagments: ".orderBy[{keys:props}]", getProp: (pathset) => pathset.props[0], refFragments: (pathset) => ["orderBy", pathset.props[0]]},
        {pathFagments: ".orderBy[{keys:props}].equalTo[{keys:searches}]", getProp: (pathset) => pathset.props[0], subQuery: (pathset) => (q) => q.equalTo(pathset.searches[0]), refFragments: (pathset) => ["orderBy", pathset.props[0], "equalTo", pathset.searches[0]]},
      ].map(queryPattern => {
        return [{
          route: `${collectionName}${queryPattern.pathFagments}[{integers:indexes}]`,
          get: function(pathset) {
            this.logPathset(pathset);
            const prop = queryPattern.getProp(pathset);
            const subQuery = queryPattern.subQuery ? (q => queryPattern.subQuery(pathset)(q.orderByChild(queryPattern.getProp(pathset)))): q => q;
            return this.query({collectionName, prop, indexes: pathset.indexes, subQuery})
            .then(results => results.map(({index, node}) => this.ref(
              [collectionName, ...queryPattern.refFragments(pathset), index],
              [collectionName, "byId", node.id]
            ))).then(result => {
              this.log("[RESULT]", JSON.stringify(result));
              return result;
            });
          }
        }, {
          route: `${collectionName}${queryPattern.pathFagments}.length`,
          get: function(pathset) {
            this.logPathset(pathset);
            const prop = queryPattern.getProp(pathset);
            const subQuery = queryPattern.subQuery ? (q => queryPattern.subQuery(pathset)(q.orderByChild(queryPattern.getProp(pathset)))): q => q;
            return subQuery(this._db.ref(collectionName)).once("value").then(snapshot => {
              const count = snapshot.numChildren();
              return {
                path: [collectionName, ...queryPattern.refFragments(pathset), "length"],
                value: count
              };
            }).then(result => {
              this.log("[RESULT]", JSON.stringify(result));
              return result;
            });
          }
        }];
      })),
      {
        // "users.byId.u001.name" のようなpathに反応する
        route: `${collectionName}.byId[{keys:ids}][{keys:props}]`,
        get: function(pathset) {
          this.logPathset(pathset);
          const paths = pathset.ids.map(id => ({ refPath: `/${collectionName}/${id}`, fPath: [collectionName, "byId", id], id}));
          return Promise.all(paths.map(p => {
            let nodePromise;
            if (this._cache.has(collectionName, p.id)) {
              nodePromise = new Promise(resolve => {
                resolve(this._cache.get(collectionName, p.id));
                this._cache.pop(collectionName, p.id);
              })
            } else {
              nodePromise = this._db.ref(p.refPath).once("value").then(snapshot => {
                const node = snapshot.val();
                if (!node) {
                  return [{
                    path: p.fPath,
                    value: {$type: "error", value: "not found"},
                  }];
                }
                return node;
              });
            }
            return nodePromise.then(node => {
              const decoded = this.decodeRef(node);
              return pathset.props.map(prop => {
                if (!decoded[prop]) {
                  return { path: [...p.fPath, prop], value: {$type: "$atom"} };
                }
                return { path: [...p.fPath, prop], value: decoded[prop] };
              });
            });
          })).then(result => {
            const flatRes = _.flatten(result.filter(r => !!r));
            this.log("[RESULT]", JSON.stringify(flatRes));
            return flatRes;
          });
        },
        set: function(jsonGraph) {
          const updates = {};
          Object.keys(jsonGraph[collectionName].byId).forEach(id => {
            const patch = this.encodeRef(jsonGraph[collectionName].byId[id]);
            Object.keys(patch).forEach(prop => {
              const refPath = `/${collectionName}/${id}/${prop}`;
              updates[refPath] = patch[prop];
            });
          });
          return this._db.ref().update(updates).then(() => ({jsonGraph}));
        }
      }, {
        route: `${collectionName}.push`,
        call: function(callpath, args) {
          const payload = args[0];
          if (!payload) {
            return [{
              path: [collectionName, "push"],
              value: { $type: "error", value: "This call function requires an argument" },
            }];
          }
          const newItemRef = this._db.ref(`/${collectionName}`).push();
          const body = this.encodeRef(payload);
          body.id = newItemRef.key;
          body.createdAt = Date.now();
          body.createdAtRev = - body.createdAt;

          let adjointRefs = [];
          const manyToOneObjects = args[1];
          if (manyToOneObjects) {
            adjointRefs = Object.keys(manyToOneObjects).map(name => {
              const keyObj = manyToOneObjects[name];
              const collectionNameToAdd = def.manyToOne[name].to;
              const keyId = keyObj.id || keyObj;
              body[name] = {
                _type: "ref",
                value: `${collectionNameToAdd}.byId.${keyId}`
              };
              const indexFields = {};
              ["createdAt", ...(def.manyToOne[name].indexes || [])].forEach(indexName => {
                indexFields[indexName] = body[indexName];
              });
              return {
                ref: this._db.ref(`/${collectionNameToAdd}/${keyId}/${collectionName}`).push(),
                indexFields,
              };
            });
          }

          return Promise.all([
            newItemRef.set(body).then(() => {
              const graph = this.decodeRef(body);
              return [
                ...Object.keys(graph).map(prop => {
                  return {
                    path: [collectionName, "byId", newItemRef.key, prop],
                    value: graph[prop],
                  };
                }),
                {
                  path: [collectionName, "lastCreated"],
                  value: { $type: "ref", value: [collectionName, "byId", newItemRef.key] }
                }
              ];
            }),
            ...adjointRefs.map(refHolder => {
              return refHolder.ref.set(Object.assign({
                _refValue: `${collectionName}.byId.${newItemRef.key}`
              }, refHolder.indexFields)).then(() => {
                return [];
              });
            })
          ]).then(result => _.flatten(result));
        }
      }
    ];
  });
  return _.flatten(routingsByCollections);
}

export function createDatasource(db, defs, opts) {

  const defaultOptions = {
    verbose: false,
  };

  class FireRouter extends Router.createClass(createRoutingDefinitions(defs)) {

    constructor(db, opts = {}) {
      super();
      this.opts = Object.assign({}, defaultOptions, opts);
      this._db = db;
      this._cache = new OnetimeCache();
    }

    log() {
      if (!this.opts.verbose) return;
      console.log.apply(console, arguments);
    }

    logPathset(pathset) {
      if (!this.opts.verbose) return;
      console.log("[PATHSET]", pathset.map(p => "[" + (Array.isArray(p) ? p.join(",") : p) + "]").join(''));
    }

    ref(path, value) {
      return {
        path,
        value: {
          $type: "ref", value
        }
      };
    }

    query ({collectionName, prop, indexes, subQuery}) {
      let q = this._db.ref(`/${collectionName}`).orderByChild(prop);
      if (subQuery) {
        q = subQuery(q);
      }
      return q.limitToFirst(_.last(indexes) + 1).once("value").then(snapshot => {
        const nodes = snapshot.val();
        if (!nodes) {
          return [];
        }
        this._cache.put(collectionName, nodes);
        const sorted = _.sortBy(_.toPairs(nodes).map(p => ({id: p[0], node: p[1]})), holder => {
          return holder.node[prop];
        });
        return indexes.map(i => {
          if (sorted[i]) {
            return {index: i, node: sorted[i].node};
          } else {
            return null;
          }
        }).filter(ps => !!ps);
      });
    }

    /**
     * Falcor JSON GraphのreferenceをFirebase Databaseに保存できる形式にシリアライズする
     **/
    encodeRef(payload) {
      const encoded = {};
      Object.keys(payload).forEach(prop => {
        if (payload[prop].$type && payload[prop].$type === "ref") {
          let path = payload[prop].value;
          if (!path) return;
          if (typeof path === "string") {
          } else if (Array.isArray(path)) {
            path = _.flatten(path).join('.');
          } else {
            return;
          }
          encoded[prop] = {_type: "ref", value: path};
        } else {
          encoded[prop] = payload[prop];
        }
      });
      return encoded;
    }

    /**
     * Firebase Databaseから取得したデータから、Falcor JSON Graphのreferenceを復元する
     **/
    decodeRef(node) {
      const decoded = {};
      Object.keys(node).forEach(prop => {
        if (node[prop]._type === "ref" && node[prop].value) {
          decoded[prop] = { $type: "ref", value: node[prop].value.split('.') };
        } else {
          decoded[prop] = { $type: "atom", value: node[prop] };
        }
      });
      return decoded;
    }
  }

  return new FireRouter(db, opts);
}
